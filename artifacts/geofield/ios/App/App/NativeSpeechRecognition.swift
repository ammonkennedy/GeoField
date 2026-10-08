import AVFoundation
import Capacitor
import Speech
import CoreMotion
import CoreLocation
import Photos
import ImageIO

@objc(GeoFieldSpeechRecognitionPlugin)
public final class GeoFieldSpeechRecognitionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GeoFieldSpeechRecognitionPlugin"
    public let jsName = "SpeechRecognition"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise)
    ]

    private var audioEngine: AVAudioEngine?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["available": SFSpeechRecognizer()?.isAvailable ?? false])
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        let speechGranted = SFSpeechRecognizer.authorizationStatus() == .authorized
        let micGranted = AVAudioSession.sharedInstance().recordPermission == .granted
        let speechDenied = [.denied, .restricted].contains(SFSpeechRecognizer.authorizationStatus())
        let micDenied = AVAudioSession.sharedInstance().recordPermission == .denied
        call.resolve(["speechRecognition": speechGranted && micGranted ? "granted" : (speechDenied || micDenied ? "denied" : "prompt")])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                call.resolve(["speechRecognition": "denied"])
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                call.resolve(["speechRecognition": granted ? "granted" : "denied"])
            }
        }
    }

    @objc func isListening(_ call: CAPPluginCall) {
        call.resolve(["listening": audioEngine?.isRunning ?? false])
    }

    @objc func start(_ call: CAPPluginCall) {
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            call.reject("Speech recognition permission is required.")
            return
        }
        guard audioEngine?.isRunning != true else {
            call.reject("Dictation is already running.")
            return
        }

        let recognizer = SFSpeechRecognizer(locale: Locale(identifier: call.getString("language") ?? "en-US"))
        let engine = AVAudioEngine()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = call.getBool("partialResults") ?? true

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in request.append(buffer) }
            recognitionTask = recognizer?.recognitionTask(with: request) { [weak self] result, error in
                guard let self else { return }
                if let transcript = result?.bestTranscription.formattedString {
                    self.notifyListeners("partialResults", data: ["matches": [transcript]])
                }
                if result?.isFinal == true || error != nil { self.finishRecognition() }
            }
            audioEngine = engine
            recognitionRequest = request
            engine.prepare()
            try engine.start()
            notifyListeners("listeningState", data: ["status": "started"])
            call.resolve()
        } catch {
            finishRecognition()
            call.reject("Could not start dictation: \(error.localizedDescription)")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        finishRecognition()
        call.resolve()
    }

    private func finishRecognition() {
        if audioEngine?.isRunning == true { audioEngine?.stop() }
        audioEngine?.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        audioEngine = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        notifyListeners("listeningState", data: ["status": "stopped"])
    }
}

@objc(GeoFieldBridgeViewController)
public final class GeoFieldBridgeViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GeoFieldSpeechRecognitionPlugin())
        bridge?.registerPluginInstance(GeoFieldGeologyMotionPlugin())
        bridge?.registerPluginInstance(GeoFieldPhotoLibraryPlugin())
        bridge?.registerPluginInstance(GeoFieldCameraPlugin())
    }
}

@objc(GeoFieldGeologyMotionPlugin)
public final class GeoFieldGeologyMotionPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "GeoFieldGeologyMotionPlugin"
    public let jsName = "GeologyMotion"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]
    private let motion = CMMotionManager()
    private let location = CLLocationManager()
    private var magneticHeading: CLLocationDirection?
    private var trueHeading: CLLocationDirection?
    private var headingAccuracy: CLLocationDirection?

    public override func load() { location.delegate = self; location.headingFilter = 1 }

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["available": motion.isDeviceMotionAvailable && CLLocationManager.headingAvailable()])
    }

    @objc func start(_ call: CAPPluginCall) {
        guard motion.isDeviceMotionAvailable else { call.reject("Core Motion orientation is unavailable."); return }
        motion.stopDeviceMotionUpdates()
        if location.authorizationStatus == .notDetermined { location.requestWhenInUseAuthorization() }
        if let interfaceOrientation = bridge?.viewController?.view.window?.windowScene?.interfaceOrientation {
            switch interfaceOrientation {
            case .landscapeLeft: location.headingOrientation = .landscapeLeft
            case .landscapeRight: location.headingOrientation = .landscapeRight
            case .portraitUpsideDown: location.headingOrientation = .portraitUpsideDown
            default: location.headingOrientation = .portrait
            }
        }
        if CLLocationManager.headingAvailable() { location.startUpdatingHeading() }
        motion.deviceMotionUpdateInterval = 1.0 / 30.0
        let frames = CMMotionManager.availableAttitudeReferenceFrames()
        let requestedReference = call.getString("northReference") ?? "magnetic"
        let frame: CMAttitudeReferenceFrame
        let activeNorthReference: String
        switch requestedReference {
        case "true":
            if frames.contains(.xTrueNorthZVertical) {
                frame = .xTrueNorthZVertical
                activeNorthReference = "true"
            } else if frames.contains(.xMagneticNorthZVertical) {
                frame = .xMagneticNorthZVertical
                activeNorthReference = "magnetic"
            } else {
                call.reject("A north-aligned Core Motion reference frame is unavailable.")
                return
            }
        case "magnetic":
            guard frames.contains(.xMagneticNorthZVertical) else {
                call.reject("A magnetic-north Core Motion reference frame is unavailable.")
                return
            }
            frame = .xMagneticNorthZVertical
            activeNorthReference = "magnetic"
        default:
            call.reject("Unsupported north reference: \(requestedReference)")
            return
        }
        motion.startDeviceMotionUpdates(using: frame, to: OperationQueue.main) { [weak self] data, _ in
            guard let self, let data else { return }
            let r = data.attitude.rotationMatrix
            let interfaceOrientation: String
            switch self.bridge?.viewController?.view.window?.windowScene?.interfaceOrientation {
            case .landscapeLeft: interfaceOrientation = "landscape-left"
            case .landscapeRight: interfaceOrientation = "landscape-right"
            case .portraitUpsideDown: interfaceOrientation = "portrait-upside-down"
            default: interfaceOrientation = "portrait"
            }
            // Device +Y points toward the visual top in portrait. Select the
            // equivalent physical axis for the active interface orientation,
            // transpose the attitude matrix (device -> reference), then convert
            // Core Motion x=north, y=west, z=up into geographic ENU.
            let deviceTop: (x: Double, y: Double, z: Double)
            switch interfaceOrientation {
            case "portrait-upside-down": deviceTop = (0, -1, 0)
            case "landscape-left": deviceTop = (-1, 0, 0)
            case "landscape-right": deviceTop = (1, 0, 0)
            default: deviceTop = (0, 1, 0)
            }
            let lineReferenceX = r.m11 * deviceTop.x + r.m21 * deviceTop.y + r.m31 * deviceTop.z
            let lineReferenceY = r.m12 * deviceTop.x + r.m22 * deviceTop.y + r.m32 * deviceTop.z
            let lineReferenceZ = r.m13 * deviceTop.x + r.m23 * deviceTop.y + r.m33 * deviceTop.z
            // Both north-vertical frames are x=north, y=west, z=up. Transposing
            // attitude maps the phone-plane +Z normal into earth ENU. Its sign
            // is immaterial because the geological math always points it upward.
            var payload: JSObject = [
                "normalEast": -r.m32, "normalNorth": r.m31, "normalUp": r.m33,
                "lineEast": -lineReferenceY, "lineNorth": lineReferenceX, "lineUp": lineReferenceZ,
                "gravityX": data.gravity.x, "gravityY": data.gravity.y, "gravityZ": data.gravity.z,
                "roll": data.attitude.roll, "pitch": data.attitude.pitch, "yaw": data.attitude.yaw,
                "matrixM11": r.m11, "matrixM12": r.m12, "matrixM13": r.m13,
                "matrixM21": r.m21, "matrixM22": r.m22, "matrixM23": r.m23,
                "matrixM31": r.m31, "matrixM32": r.m32, "matrixM33": r.m33,
                "interfaceOrientation": interfaceOrientation,
                "quaternionX": data.attitude.quaternion.x, "quaternionY": data.attitude.quaternion.y,
                "quaternionZ": data.attitude.quaternion.z, "quaternionW": data.attitude.quaternion.w,
                "northReference": activeNorthReference,
                "referenceFrame": activeNorthReference
            ]
            if let value = self.magneticHeading { payload["magneticHeading"] = value }
            if let value = self.trueHeading { payload["trueHeading"] = value }
            if let value = self.headingAccuracy { payload["headingAccuracy"] = value }
            self.notifyListeners("orientation", data: payload)
        }
        call.resolve(["northReference": activeNorthReference])
    }

    @objc func stop(_ call: CAPPluginCall) { motion.stopDeviceMotionUpdates(); location.stopUpdatingHeading(); call.resolve() }
    public func locationManager(_ manager: CLLocationManager, didUpdateHeading heading: CLHeading) {
        magneticHeading = heading.magneticHeading
        trueHeading = heading.trueHeading >= 0 ? heading.trueHeading : nil
        headingAccuracy = heading.headingAccuracy >= 0 ? heading.headingAccuracy : nil
    }
    public func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool { true }
}


@objc(GeoFieldPhotoLibraryPlugin)
public final class GeoFieldPhotoLibraryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GeoFieldPhotoLibraryPlugin"
    public let jsName = "GeoFieldPhotoLibrary"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "savePhoto", returnType: CAPPluginReturnPromise)
    ]

    @objc func savePhoto(_ call: CAPPluginCall) {
        guard let encoded = call.getString("base64"),
              let data = Data(base64Encoded: encoded),
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              CGImageSourceGetCount(source) > 0 else {
            call.reject("This file could not be read as a photo.")
            return
        }
        let filename = (call.getString("filename") ?? "geofield-photo.jpg") as NSString
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("Allow GeoField to add photos in iPhone Settings, then try downloading again.")
                return
            }
            PHPhotoLibrary.shared().performChanges({
                let request = PHAssetCreationRequest.forAsset()
                let options = PHAssetResourceCreationOptions()
                options.originalFilename = filename.lastPathComponent
                request.addResource(with: .photo, data: data, options: options)
            }) { success, error in
                if success { call.resolve() }
                else { call.reject(error?.localizedDescription ?? "Photos could not save this picture. Please try again.") }
            }
        }
    }
}

/// Rear-camera direction is sampled at our shutter action, not when the picker closes.
@objc(GeoFieldCameraPlugin)
public final class GeoFieldCameraPlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    public let identifier = "GeoFieldCameraPlugin"
    public let jsName = "GeoFieldCamera"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "capture", returnType: CAPPluginReturnPromise)]
    private let motion = CMMotionManager()
    private var pending: CAPPluginCall?
    private var picker: UIImagePickerController?
    private var shutter: UIButton?
    private var direction: JSObject?

    @objc func capture(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pending == nil else { call.reject("The camera is already open."); return }
            guard UIImagePickerController.isCameraDeviceAvailable(.rear) else { call.reject("A rear camera is unavailable on this device."); return }
            self.pending = call
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized: self.presentCamera()
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { allowed in
                    DispatchQueue.main.async {
                        if allowed { self.presentCamera() }
                        else { self.pending?.reject("Allow camera access in Settings to take photos."); self.pending = nil }
                    }
                }
            default: self.pending?.reject("Allow camera access in Settings to take photos."); self.pending = nil
            }
        }
    }
    private func presentCamera() {
        guard let presenter = bridge?.viewController, presenter.presentedViewController == nil else {
            pending?.reject("Close the other camera or system dialog and try again."); pending = nil; return
        }
        direction = nil
        if motion.isDeviceMotionAvailable && CMMotionManager.availableAttitudeReferenceFrames().contains(.xMagneticNorthZVertical) {
            motion.deviceMotionUpdateInterval = 1.0 / 30.0
            motion.showsDeviceMovementDisplay = true
            motion.startDeviceMotionUpdates(using: .xMagneticNorthZVertical)
        }
        let camera = UIImagePickerController()
        camera.sourceType = .camera; camera.cameraDevice = .rear; camera.cameraCaptureMode = .photo
        camera.delegate = self; camera.showsCameraControls = false; camera.modalPresentationStyle = .fullScreen
        let overlay = UIView(frame: presenter.view.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        let take = UIButton(type: .system)
        take.setTitle("Take photo", for: .normal); take.setTitleColor(.white, for: .normal)
        take.backgroundColor = .systemBlue; take.layer.cornerRadius = 25
        take.titleLabel?.font = .boldSystemFont(ofSize: 18)
        take.addTarget(self, action: #selector(takePhoto), for: .touchUpInside)
        let cancel = UIButton(type: .system)
        cancel.setTitle("Cancel", for: .normal); cancel.setTitleColor(.white, for: .normal)
        cancel.backgroundColor = .black; cancel.layer.cornerRadius = 12
        cancel.addTarget(self, action: #selector(cancelPhoto), for: .touchUpInside)
        let hint = UILabel(); hint.text = "Hold still while taking the photo"; hint.textColor = .white
        hint.backgroundColor = UIColor.black.withAlphaComponent(0.7); hint.textAlignment = .center
        for view in [take, cancel, hint] { view.translatesAutoresizingMaskIntoConstraints = false; overlay.addSubview(view) }
        NSLayoutConstraint.activate([
            take.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            take.bottomAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            take.widthAnchor.constraint(equalToConstant: 160), take.heightAnchor.constraint(equalToConstant: 52),
            cancel.leadingAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            cancel.topAnchor.constraint(equalTo: overlay.safeAreaLayoutGuide.topAnchor, constant: 16),
            cancel.widthAnchor.constraint(equalToConstant: 90), cancel.heightAnchor.constraint(equalToConstant: 44),
            hint.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            hint.bottomAnchor.constraint(equalTo: take.topAnchor, constant: -12),
            hint.widthAnchor.constraint(equalToConstant: 290), hint.heightAnchor.constraint(equalToConstant: 30)
        ])
        camera.cameraOverlayView = overlay; picker = camera; shutter = take
        presenter.present(camera, animated: true)
    }
    @objc private func takePhoto() {
        guard let camera = picker, shutter?.isEnabled == true else { return }
        direction = nil
        if let data = motion.deviceMotion,
           ProcessInfo.processInfo.systemUptime - data.timestamp < 0.5,
           data.magneticField.accuracy != .uncalibrated {
            // Transpose reference->device attitude. Rear lens looks along -Z.
            // Magnetic frame: X=north, Y=west; east=r.m32, north=-r.m31.
            let r = data.attitude.rotationMatrix
            let east = r.m32, north = -r.m31
            if hypot(east, north) > 0.17 {
                let bearing = (atan2(east, north) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
                let quality = data.magneticField.accuracy == .high ? "high" : data.magneticField.accuracy == .medium ? "medium" : "low"
                direction = ["degrees": bearing, "reference": "magnetic", "accuracy": quality]
            }
        }
        shutter?.isEnabled = false
        camera.takePicture()
    }
    @objc private func cancelPhoto() { finish(["cancelled": true]) }
    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { cancelPhoto() }
    public func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        guard let image = info[.originalImage] as? UIImage else { failPhoto(); return }
        // Bound bridge memory and normalize orientation before passing JPEG to JS.
        let scale = min(1, 1600 / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let normalized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        guard let jpeg = normalized.jpegData(compressionQuality: 0.85) else { failPhoto(); return }
        var result: JSObject = ["base64": jpeg.base64EncodedString()]
        if let direction { result["direction"] = direction }
        finish(result)
    }
    private func failPhoto() {
        let call = pending; cleanup(); picker?.dismiss(animated: true); picker = nil
        call?.reject("Could not read the camera photo. Please try again.")
    }
    private func finish(_ result: JSObject) {
        let call = pending; cleanup()
        picker?.dismiss(animated: true) { call?.resolve(result) }; picker = nil
    }
    private func cleanup() { motion.stopDeviceMotionUpdates(); pending = nil; direction = nil; shutter = nil }
}
