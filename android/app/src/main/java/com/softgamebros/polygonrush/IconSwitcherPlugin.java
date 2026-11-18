package com.softgamebros.polygonrush;

import android.content.ComponentName;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Seasonal home-screen icon: enables one launcher alias (IconDefault,
 * IconChristmas) and disables the rest. The game only calls set() while it
 * is going to the background, so the launcher refreshing the icon never
 * interrupts play.
 */
@CapacitorPlugin(name = "IconSwitcher")
public class IconSwitcherPlugin extends Plugin {

    private static final String[] ICONS = { "Default", "Christmas" };

    private ComponentName alias(String name) {
        return new ComponentName(getContext().getPackageName(), "com.softgamebros.polygonrush.Icon" + name);
    }

    private boolean enabled(PackageManager pm, String name) {
        int state = pm.getComponentEnabledSetting(alias(name));
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return "Default".equals(name);
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    @PluginMethod
    public void current(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        String current = "Default";
        for (String name : ICONS) {
            if (enabled(pm, name)) current = name;
        }
        JSObject out = new JSObject();
        out.put("name", current);
        call.resolve(out);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String want = call.getString("name", "Default");
        boolean known = false;
        for (String name : ICONS) known |= name.equals(want);
        if (!known) {
            call.reject("Unknown icon: " + want);
            return;
        }
        PackageManager pm = getContext().getPackageManager();
        try {
            // Turn the new one on first, so there is never a moment with no launcher icon.
            pm.setComponentEnabledSetting(alias(want), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            for (String name : ICONS) {
                if (!name.equals(want)) pm.setComponentEnabledSetting(alias(name), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't switch the icon", e);
        }
    }
}
