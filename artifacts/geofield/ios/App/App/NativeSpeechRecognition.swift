import AVFoundation
import Capacitor
import Speech
import CoreMotion
import CoreLocation

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
        motion.deviceMotionUpdateInterval = 1.0 / 15.0
        let frames = CMMotionManager.availableAttitudeReferenceFrames()
        // Prefer Core Motion's true-north frame so strike is produced in one
        // authoritative earth frame. Magnetic north remains a valid fallback,
        // but a relative frame must never be presented as an absolute azimuth.
        let frame: CMAttitudeReferenceFrame
        let referenceFrame: String
        if frames.contains(.xTrueNorthZVertical) {
            frame = .xTrueNorthZVertical
            referenceFrame = "true"
        } else if frames.contains(.xMagneticNorthZVertical) {
            frame = .xMagneticNorthZVertical
            referenceFrame = "magnetic"
        } else {
            call.reject("A north-referenced Core Motion frame is unavailable.")
            return
        }
        motion.startDeviceMotionUpdates(using: frame, to: OperationQueue.main) { [weak self] data, _ in
            guard let self, let data else { return }
            let r = data.attitude.rotationMatrix
            // Both north-vertical frames are x=north, y=west, z=up. Transposing
            // attitude maps the phone-plane +Z normal into earth ENU. Its sign
            // is immaterial because the geological math always points it upward.
            var payload: JSObject = [
                "normalEast": -r.m32, "normalNorth": r.m31, "normalUp": r.m33,
                "gravityX": data.gravity.x, "gravityY": data.gravity.y, "gravityZ": data.gravity.z,
                "quaternionX": data.attitude.quaternion.x, "quaternionY": data.attitude.quaternion.y,
                "quaternionZ": data.attitude.quaternion.z, "quaternionW": data.attitude.quaternion.w,
                "referenceFrame": referenceFrame
            ]
            if let value = self.magneticHeading { payload["magneticHeading"] = value }
            if let value = self.trueHeading { payload["trueHeading"] = value }
            if let value = self.headingAccuracy { payload["headingAccuracy"] = value }
            self.notifyListeners("orientation", data: payload)
        }
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) { motion.stopDeviceMotionUpdates(); location.stopUpdatingHeading(); call.resolve() }
    public func locationManager(_ manager: CLLocationManager, didUpdateHeading heading: CLHeading) {
        magneticHeading = heading.magneticHeading
        trueHeading = heading.trueHeading >= 0 ? heading.trueHeading : nil
        headingAccuracy = heading.headingAccuracy >= 0 ? heading.headingAccuracy : nil
    }
    public func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool { true }
}
