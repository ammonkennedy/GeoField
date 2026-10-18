package com.ammonkennedy.geofield;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.view.Surface;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GeologyMotion")
public class GeologyMotionPlugin extends Plugin implements SensorEventListener {
    private SensorManager manager;
    private Sensor sensor;
    private long last;
    private boolean running;
    @Override public void load() {
        manager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        sensor = manager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
    }
    @PluginMethod public void available(PluginCall call) { JSObject value = new JSObject(); value.put("available", sensor != null); call.resolve(value); }
    @PluginMethod public void start(PluginCall call) {
        stopSensor();
        if (sensor == null) { call.reject("A compass-aligned rotation sensor is unavailable on this device."); return; }
        running = manager.registerListener(this, sensor, 33333); last = 0;
        if (!running) { call.reject("Could not start the compass sensor."); return; }
        // Android rotation vectors are magnetic ENU. Never label them true north.
        JSObject result = new JSObject(); result.put("northReference", "magnetic"); call.resolve(result);
    }
    @PluginMethod public void stop(PluginCall call) { stopSensor(); call.resolve(); }
    private void stopSensor() { if (manager != null) manager.unregisterListener(this); running = false; }
    @Override protected void handleOnPause() { if (manager != null) manager.unregisterListener(this); }
    @Override protected void handleOnResume() { if (running && sensor != null) manager.registerListener(this, sensor, 33333); }
    @Override protected void handleOnDestroy() { stopSensor(); }
    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    @Override public void onSensorChanged(SensorEvent event) {
        if (!running || event.timestamp - last < 30000000) return;
        last = event.timestamp;
        float[] r = new float[9]; SensorManager.getRotationMatrixFromVector(r, event.values);
        int rotation = getActivity().getWindowManager().getDefaultDisplay().getRotation();
        double x = 0, y = 1;
        String orientation = "portrait";
        if (rotation == Surface.ROTATION_90) { x = -1; y = 0; orientation = "landscape-left"; }
        else if (rotation == Surface.ROTATION_180) { y = -1; orientation = "portrait-upside-down"; }
        else if (rotation == Surface.ROTATION_270) { x = 1; y = 0; orientation = "landscape-right"; }
        JSObject p = new JSObject();
        p.put("normalEast", r[2]); p.put("normalNorth", r[5]); p.put("normalUp", r[8]);
        p.put("lineEast", r[0]*x+r[1]*y); p.put("lineNorth", r[3]*x+r[4]*y); p.put("lineUp", r[6]*x+r[7]*y);
        p.put("gravityX", -r[6]); p.put("gravityY", -r[7]); p.put("gravityZ", -r[8]);
        // Shared drawing math expects reference(North,West,Up)->device matrix.
        p.put("matrixM11", r[3]); p.put("matrixM12", -r[0]); p.put("matrixM13", r[6]);
        p.put("matrixM21", r[4]); p.put("matrixM22", -r[1]); p.put("matrixM23", r[7]);
        p.put("matrixM31", r[5]); p.put("matrixM32", -r[2]); p.put("matrixM33", r[8]);
        // Rotation-vector quaternion is stored in its native Android ENU convention.
        float[] q = new float[4]; SensorManager.getQuaternionFromVector(q, event.values);
        p.put("quaternionW", q[0]); p.put("quaternionX", q[1]); p.put("quaternionY", q[2]); p.put("quaternionZ", q[3]);
        p.put("magneticHeading", (Math.toDegrees(Math.atan2(r[0]*x+r[1]*y, r[3]*x+r[4]*y))+360)%360);
        if (event.values.length >= 5 && event.values[4] >= 0) p.put("headingAccuracy", Math.toDegrees(event.values[4]));
        p.put("interfaceOrientation", orientation); p.put("northReference", "magnetic"); p.put("referenceFrame", "magnetic");
        notifyListeners("orientation", p);
    }
}
