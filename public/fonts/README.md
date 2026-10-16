# Fuentes locales

Inter y Outfit se distribuyen bajo SIL Open Font License 1.1. Sus licencias
originales se incluyen en `Inter-OFL.txt` y `Outfit-OFL.txt`.

Fuentes originales descargadas del repositorio Google Fonts el 16 de octubre de
2026:

- https://github.com/google/fonts/tree/main/ofl/inter
- https://github.com/google/fonts/tree/main/ofl/outfit

Los archivos variables TTF originales se convirtieron íntegramente a WOFF2 con
FontTools (`TTFont`, `flavor = 'woff2'`), sin recortar caracteres ni pesos.
`src/index.css` declara ambas familias con `font-display: swap`. El arranque no
solicita hojas de estilos ni fuentes a Google Fonts.
