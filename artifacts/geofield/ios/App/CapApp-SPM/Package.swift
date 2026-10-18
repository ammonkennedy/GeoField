// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.2"),
        .package(name: "CapacitorCommunityBackgroundGeolocation", path: "../../../../../node_modules/.pnpm/@capacitor-community+background-geolocation@1.2.26_patch_hash=bmwsnqpyauqjxipozsqol3mlea_@capacitor+core@8.4.2/node_modules/@capacitor-community/background-geolocation"),
        .package(name: "CapacitorCommunityFileOpener", path: "../../../../../node_modules/.pnpm/@capacitor-community+file-opener@8.0.1_@capacitor+core@8.4.2/node_modules/@capacitor-community/file-opener"),
        .package(name: "CapacitorFilesystem", path: "../../../../../node_modules/.pnpm/@capacitor+filesystem@8.1.2_@capacitor+core@8.4.2/node_modules/@capacitor/filesystem")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunityBackgroundGeolocation", package: "CapacitorCommunityBackgroundGeolocation"),
                .product(name: "CapacitorCommunityFileOpener", package: "CapacitorCommunityFileOpener"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem")
            ]
        )
    ]
)
