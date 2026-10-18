package com.ammonkennedy.geofield;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(GeologyMotionPlugin.class);
        registerPlugin(GeoFieldTrackingPermissionsPlugin.class);
        registerPlugin(GeoFieldFilesPlugin.class);
        registerPlugin(GeoFieldPhotoLibraryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
