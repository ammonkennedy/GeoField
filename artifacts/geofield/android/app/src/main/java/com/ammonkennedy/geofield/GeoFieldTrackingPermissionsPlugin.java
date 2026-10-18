package com.ammonkennedy.geofield;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

@CapacitorPlugin(name = "GeoFieldTrackingPermissions", permissions = @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS}))
public class GeoFieldTrackingPermissionsPlugin extends Plugin {
    @PluginMethod public void request(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationResult");
        } else resolvePermission(call);
    }
    @PermissionCallback private void notificationResult(PluginCall call) { resolvePermission(call); }
    private void resolvePermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }
}
