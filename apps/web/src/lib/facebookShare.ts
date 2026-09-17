"use client";

// F08/P6: Facebook Share Dialog that qua Facebook JavaScript SDK - can mot Facebook App
// ID THAT (dang ky tai developers.facebook.com, chi nguoi dung/MISA tao duoc, xem
// ROADMAP.md muc P6). Day la "Share dialog" cong khai (khong xin quyen dang nhap/dang
// bai), theo chinh sach Facebook hien tai KHONG can App Review de dung. Neu chua cau
// hinh NEXT_PUBLIC_FACEBOOK_APP_ID hoac SDK loi (mang chan connect.facebook.net...),
// goi dung phai tu fallback ve link sharer.php (khong can app, luon hoat dong).

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; version: string; xfbml?: boolean }) => void;
      ui: (
        params: { method: string; href: string },
        callback?: (response: { error_message?: string } | undefined) => void
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_VERSION = "v21.0";
let fbSdkPromise: Promise<void> | null = null;

function loadFacebookSdk(appId: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("khong co window"));
  if (window.FB) return Promise.resolve();
  if (fbSdkPromise) return fbSdkPromise;

  fbSdkPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, version: FB_SDK_VERSION, xfbml: false });
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/vi_VN/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => reject(new Error("Khong tai duoc Facebook SDK"));
    document.body.appendChild(script);
  });
  return fbSdkPromise;
}

export function getFacebookAppId(): string | undefined {
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  return appId && appId.trim() !== "" ? appId : undefined;
}

/** true = da mo dialog that; false = SDK bao loi (vd appId sai) - goi noi nen tu fallback link. */
export async function shareViaFacebookDialog(appId: string, url: string): Promise<boolean> {
  await loadFacebookSdk(appId);
  return new Promise((resolve) => {
    if (!window.FB) return resolve(false);
    window.FB.ui({ method: "share", href: url }, (response) => {
      resolve(!response?.error_message);
    });
  });
}
