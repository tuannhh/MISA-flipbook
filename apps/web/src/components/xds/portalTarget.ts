// Khi mot phan tu dang o che do toan man hinh (Fullscreen API), trinh duyet CHI hien
// cay con cua phan tu do - portal vao document.body se bi an (dialog/toast/menu vo hinh).
// Nen portal vao chinh phan tu fullscreen neu co.
export function portalTarget(): HTMLElement {
  return (document.fullscreenElement as HTMLElement | null) ?? document.body;
}
