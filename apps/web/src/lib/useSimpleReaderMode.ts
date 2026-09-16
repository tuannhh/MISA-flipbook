"use client";
import { useEffect, useState } from "react";

/**
 * Heuristic best-effort: phat hien may/trinh duyet nen tranh hieu ung 3D lat trang
 * (PLAN.md muc 4: "May khong du kha nang chay hieu ung van doc mot trang va chuyen
 * trang don gian"). KHONG phai benchmark thuc te tren thiet bi yeu that - chi la
 * suy doan tu prefers-reduced-motion (chuan, dang tin cay) va navigator.deviceMemory/
 * hardwareConcurrency (Chromium-only cho deviceMemory, la proxy tho cho CPU chu khong
 * do duoc GPU compositing). Neu can chinh xac hon phai do tren thiet bi that.
 */
export interface SimpleReaderMode {
  /** true = bo qua hoan toan transform 3D, chi doi trang don gian (rot/keyboard/click van hoat dong) */
  simple: boolean;
  /** true = nguoi dung/OS xin giam chuyen dong - khong dung ca hieu ung fade thay the */
  reducedMotion: boolean;
}

export function useSimpleReaderMode(): SimpleReaderMode {
  const [state, setState] = useState<SimpleReaderMode>({ simple: false, reducedMotion: false });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const nav = navigator as Navigator & { deviceMemory?: number };
    const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2;
    const lowCores = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 2;

    function evaluate() {
      setState({ reducedMotion: mq.matches, simple: mq.matches || lowMemory || lowCores });
    }

    evaluate();
    mq.addEventListener("change", evaluate);
    return () => mq.removeEventListener("change", evaluate);
  }, []);

  return state;
}
