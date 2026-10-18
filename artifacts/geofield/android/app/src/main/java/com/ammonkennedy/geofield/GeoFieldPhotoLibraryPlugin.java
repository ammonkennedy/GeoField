package com.ammonkennedy.geofield;

import android.Manifest;
import android.content.ContentValues;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.net.Uri;
import android.util.Base64;
import android.graphics.BitmapFactory;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.OutputStream;

@CapacitorPlugin(name = "GeoFieldPhotoLibrary", permissions = @Permission(alias = "legacyStorage", strings = {Manifest.permission.WRITE_EXTERNAL_STORAGE}))
public class GeoFieldPhotoLibraryPlugin extends Plugin {
    @PluginMethod public void savePhoto(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29 && getPermissionState("legacyStorage") != PermissionState.GRANTED) {
            requestPermissionForAlias("legacyStorage", call, "storageResult"); return;
        }
        writePhoto(call);
    }
    @PermissionCallback private void storageResult(PluginCall call) {
        if (getPermissionState("legacyStorage") != PermissionState.GRANTED) { call.reject("Allow photo storage access to save this picture."); return; }
        writePhoto(call);
    }
    private void writePhoto(PluginCall call) {
        Uri uri = null;
        try {
            byte[] data = Base64.decode(call.getString("base64", ""), Base64.DEFAULT);
            BitmapFactory.Options options = new BitmapFactory.Options(); options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(data, 0, data.length, options);
            if (options.outWidth <= 0 || options.outHeight <= 0) throw new Exception("Invalid image");
            ContentValues values = new ContentValues();
            values.put(MediaStore.Images.Media.DISPLAY_NAME, call.getString("filename", "GeoField-photo.jpg"));
            values.put(MediaStore.Images.Media.MIME_TYPE, options.outMimeType);
            if (Build.VERSION.SDK_INT >= 29) {
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/GeoField");
                values.put(MediaStore.Images.Media.IS_PENDING, 1);
            }
            uri = getContext().getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new Exception("Photo storage unavailable");
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri)) {
                if (stream == null) throw new Exception("Photo storage unavailable");
                stream.write(data);
            }
            if (Build.VERSION.SDK_INT >= 29) { values.clear(); values.put(MediaStore.Images.Media.IS_PENDING, 0); getContext().getContentResolver().update(uri, values, null, null); }
            call.resolve();
        } catch (Exception error) {
            if (uri != null) getContext().getContentResolver().delete(uri, null, null);
            call.reject("Could not save the photo. Check available storage and try again.", error);
        }
    }
}
