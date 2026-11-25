package com.geofield.mobile;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.File;
import java.io.FileOutputStream;
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
    @PluginMethod public void shareFile(PluginCall call) {
        String encoded = call.getString("base64");
        if (encoded == null) { call.reject("The file is empty."); return; }
        String filename = call.getString("filename", "GeoField-project.geofield").replaceAll("[\\\\/:*?\"<>|]+", "-");
        File directory = new File(getContext().getCacheDir(), "project-shares");
        File file = new File(directory, filename);
        try {
            if (!directory.exists() && !directory.mkdirs()) throw new Exception("Could not prepare the share file.");
            try (FileOutputStream stream = new FileOutputStream(file)) {
                stream.write(Base64.decode(encoded, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(call.getString("mimeType", "application/octet-stream"));
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, call.getString("title", "Share GeoField project"));
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> getActivity().startActivity(chooser));
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not prepare the project for sharing.", error);
        }
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
