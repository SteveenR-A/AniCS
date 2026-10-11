#![cfg(target_os = "linux")]

use glib::prelude::*;

// RUSTSEC-2024-0429 must be checked with optimizations: the old immutable
// out-pointer could appear to work in debug builds and crash in release builds.
#[test]
fn string_variant_iteration_preserves_forward_and_backward_values() {
    let values = ["alpha", "日本語", "", "omega"];
    let variant = values.to_variant();
    assert_eq!(variant.array_iter_str().unwrap().collect::<Vec<_>>(), values);
    assert_eq!(
        variant.array_iter_str().unwrap().rev().collect::<Vec<_>>(),
        ["omega", "", "日本語", "alpha"]
    );
    let mut mixed = variant.array_iter_str().unwrap();
    assert_eq!(mixed.next(), Some("alpha"));
    assert_eq!(mixed.next_back(), Some("omega"));
    assert_eq!(mixed.nth(0), Some("日本語"));
    assert_eq!(mixed.nth_back(0), Some(""));
    assert_eq!(mixed.next(), None);
    assert_eq!(mixed.next_back(), None);
    assert_eq!(variant.array_iter_str().unwrap().last(), Some("omega"));
}

#[test]
fn empty_and_wrong_type_variants_keep_existing_semantics() {
    assert_eq!(Vec::<String>::new().to_variant().array_iter_str().unwrap().next(), None);
    assert!(42i32.to_variant().array_iter_str().is_err());
}
