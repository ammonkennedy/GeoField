package com.ammonkennedy.geofield;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.OutputStream;

@CapacitorPlugin(name = "GeoFieldFiles")
public class GeoFieldFilesPlugin extends Plugin {
    @PluginMethod public void saveFile(PluginCall call) {
        if (call.getString("base64") == null) { call.reject("The file is empty."); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("filename", "GeoField-export"));
        startActivityForResult(call, intent, "savedLocation");
    }
    @ActivityCallback private void savedLocation(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { call.reject("Save cancelled."); return; }
        Uri uri = result.getData().getData();
        if (uri == null) { call.reject("No save location was selected."); return; }
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri)) {
            if (stream == null) throw new Exception("Cannot open the selected location.");
            stream.write(Base64.decode(call.getString("base64"), Base64.DEFAULT));
            call.resolve();
        } catch (Exception error) { call.reject("Could not save the file. Please try again.", error); }
    }
}
