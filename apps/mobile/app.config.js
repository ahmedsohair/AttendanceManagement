const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://attendance-management-admin.vercel.app";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://mtoyhpyxqhfwhcrysqon.supabase.co";

const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  "sb_publishable_k5pAfbNTjePhFXVEIneHuA_YyBpRK76";

module.exports = {
  expo: {
    name: "Attendance Management System",
    slug: "attendance-management-system",
    owner: "ahmedsohair",
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
      bundleIdentifier: "com.ahmedsohair.attendancemanagement",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false
      }
    },
    extra: {
      apiBaseUrl,
      supabaseUrl,
      supabasePublishableKey,
      eas: {
        projectId: "ab3cb0e1-ad54-4050-95f9-be635d725397"
      }
    }
  }
};
