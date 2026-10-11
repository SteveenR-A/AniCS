# GLib 0.18.5 compatibility backport

This directory contains the published `glib` 0.18.5 crate (MIT license), with the
two-line fix from [gtk-rs-core PR #1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343)
for [RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g](https://rustsec.org/advisories/RUSTSEC-2024-0429.html).

In `src/variant_iter.rs`, `VariantStrIter::impl_get` now passes a mutable
out-pointer to `g_variant_get_child`. Forward and backward string iteration share
this helper. No API, dependency, or version changes were made to the crate.

Tauri's GTK 3 / WebKitGTK bindings require GLib 0.18. Adding 0.20 would not replace
that dependency. `src-tauri/Cargo.toml` therefore patches the registry dependency
to this source. Preserve `LICENSE` and `COPYRIGHT`, and remove the backport when
the supported desktop stack no longer needs GLib 0.18.

Registry provenance: `glib` 0.18.5, checksum
`233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`.
Registry-specific `.cargo-*` cache metadata is excluded. A version-only scanner
can still report 0.18.5; assess the patched implementation and package source,
and do not dismiss an alert solely because the dependency is vendored.
