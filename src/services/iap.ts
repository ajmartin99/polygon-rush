import { NativePurchases, PURCHASE_TYPE, type Transaction } from '@capgo/native-purchases';
import { Emitter } from '../core/emitter';
import { isNative } from '../core/platform';
import { grantProduct, productById, PRODUCTS, type GrantResult } from '../meta/products';
import { store } from '../state/store';

export interface StoreProduct {
  id: string;
  title: string;
  price: string;
}

export type PurchaseOutcome = 'ok' | 'cancelled' | 'pending' | 'unavailable' | 'error';

interface IapEvents extends Record<string, unknown> {
  products: void;
  granted: { id: string; result: GrantResult };
}

const PURCHASED = '1';
const PENDING = '2';

/**
 * Google Play Billing via @capgo/native-purchases.
 * Entitlements are applied locally and de-duplicated by order id so a purchase
 * is never granted twice, and restored automatically on every launch.
 */
class IapService extends Emitter<IapEvents> {
  private products = new Map<string, StoreProduct>();
  private native = false;
  available = false;
  private initialised = false;

  async init(): Promise<void> {
    if (this.initialised) return;
    this.initialised = true;
    this.native = isNative();
    if (!this.native) {
      // Dev/web: simulated store with placeholder prices.
      this.available = true;
      for (const p of PRODUCTS) this.products.set(p.id, { id: p.id, title: p.name, price: p.fallbackPrice });
      this.emit('products', undefined);
      return;
    }
    try {
      const { isBillingSupported } = await NativePurchases.isBillingSupported();
      if (!isBillingSupported) return;
      const { products } = await NativePurchases.getProducts({
        productIdentifiers: PRODUCTS.map((p) => p.id),
        productType: PURCHASE_TYPE.INAPP,
      });
      for (const p of products) {
        this.products.set(p.identifier, { id: p.identifier, title: p.title, price: p.priceString });
      }
      this.available = this.products.size > 0;
      this.emit('products', undefined);
      void NativePurchases.addListener('transactionUpdated', (t) => this.handleTransaction(t));
      await this.restore(true);
    } catch (e) {
      console.warn('Billing unavailable', e);
      this.available = false;
    }
  }

  product(id: string): StoreProduct | undefined {
    return this.products.get(id);
  }

  priceOf(id: string): string {
    return this.products.get(id)?.price ?? productById(id)?.fallbackPrice ?? '';
  }

  private txKey(t: Transaction): string {
    return t.orderId || t.purchaseToken || t.transactionId;
  }

  private alreadyGranted(t: Transaction): boolean {
    return store.data.purchases.tx.includes(this.txKey(t));
  }

  private markGranted(t: Transaction): void {
    const tx = store.data.purchases.tx;
    tx.push(this.txKey(t));
    if (tx.length > 100) tx.splice(0, tx.length - 100);
  }

  private apply(id: string, t?: Transaction): GrantResult | null {
    if (t && this.alreadyGranted(t)) return null;
    const result = grantProduct(store.data, id);
    if (t) this.markGranted(t);
    store.commit();
    store.emit('gems', { gems: store.data.gems, delta: result.gems });
    void store.flush();
    this.emit('granted', { id, result });
    return result;
  }

  private async handleTransaction(t: Transaction): Promise<void> {
    if (t.purchaseState && t.purchaseState !== PURCHASED) return;
    const def = productById(t.productIdentifier);
    if (!def) return;
    if (def.kind === 'consumable') {
      if (!this.alreadyGranted(t)) this.apply(def.id, t);
      if (t.purchaseToken) {
        try {
          await NativePurchases.consumePurchase({ purchaseToken: t.purchaseToken });
        } catch {
          /* already consumed */
        }
      }
    } else {
      this.apply(def.id, t);
    }
  }

  async purchase(id: string): Promise<PurchaseOutcome> {
    const def = productById(id);
    if (!def) return 'error';
    if (!this.native) {
      // Simulated purchase for development builds.
      this.apply(id);
      return 'ok';
    }
    if (!this.available) return 'unavailable';
    try {
      const t = await NativePurchases.purchaseProduct({
        productIdentifier: id,
        productType: PURCHASE_TYPE.INAPP,
        isConsumable: def.kind === 'consumable',
      });
      if (t.purchaseState === PENDING) return 'pending';
      this.apply(id, t);
      return 'ok';
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).toLowerCase();
      if (msg.includes('cancel')) return 'cancelled';
      if (msg.includes('already') && def.kind === 'nonconsumable') {
        await this.restore(true);
        return 'ok';
      }
      console.warn('Purchase failed', e);
      return 'error';
    }
  }

  /** Re-apply everything Google Play says this account owns. Returns count restored. */
  async restore(silent = false): Promise<number> {
    if (!this.native) return 0;
    let count = 0;
    try {
      const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
      for (const t of purchases) {
        if (t.purchaseState && t.purchaseState !== PURCHASED) continue;
        const def = productById(t.productIdentifier);
        if (!def) continue;
        if (def.kind === 'nonconsumable') {
          // Idempotent: grantProduct never double-grants entitlements.
          const r = grantProduct(store.data, def.id);
          if (r.noAds || r.skins.length || r.trails.length || r.gems) {
            count += 1;
            this.emit('granted', { id: def.id, result: r });
          }
        } else {
          // An unconsumed consumable means a previous grant may have been interrupted.
          await this.handleTransaction(t);
        }
      }
      store.commit();
      store.emit('gems', { gems: store.data.gems, delta: 0 });
    } catch (e) {
      if (!silent) console.warn('Restore failed', e);
    }
    return count;
  }
}

export const iap = new IapService();
