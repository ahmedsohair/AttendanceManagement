import AsyncStorage from "@react-native-async-storage/async-storage";

const deviceIdKey = "algo-attendance-device-id";

function createId() {
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getDeviceId() {
  const existing = await AsyncStorage.getItem(deviceIdKey);
  if (existing) {
    return existing;
  }

  const next = createId();
  await AsyncStorage.setItem(deviceIdKey, next);
  return next;
}
