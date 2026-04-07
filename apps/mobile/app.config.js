const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:3000";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  "";

module.exports = {
  expo: {
    name: "Attendance Management System",
    slug: "algo-attendance",
    scheme: "attendancemanagement",
    version: "1.0.0",
    orientation: "portrait",
    platforms: ["ios", "android"],
    userInterfaceStyle: "light",
    assetBundlePatterns: ["**/*"],
    plugins: [
      [
        "react-native-vision-camera",
        {
          cameraPermissionText:
            "Allow Algo Attendance to access the camera for live student ID scanning.",
          enableFrameProcessors: true
        }
      ]
    ],
    android: {
      permissions: ["android.permission.CAMERA"],
      package: "com.ahmedsohair.attendancemanagement"
    },
    ios: {
      bundleIdentifier: "com.ahmedsohair.attendancemanagement"
    },
    extra: {
      apiBaseUrl,
      supabaseUrl,
      supabasePublishableKey
    }
  }
};
