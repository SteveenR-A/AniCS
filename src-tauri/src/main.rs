// Previene consola extra en Windows en release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    anics_lib::run();
}
