//! TOML 설정: 내장 기본값 위에 사용자 설정을 깊게 병합하고, 잘못된 부분은 경고로 모은다.
//! 어떤 입력에서도 패닉하지 않고 항상 쓸 수 있는 설정을 돌려준다.

mod config;
mod keybindings;
mod load;
mod merge;
mod store;

pub use config::{
    Behavior, BehaviorLayout, BehaviorTable, Config, ConfirmConfig, Display, Environment,
    FavoriteDto, FavoriteLeaf, LayoutConfig, QuickSelect, SelectionConfig, TableView, ViewConfig,
};
pub use keybindings::BindingSpec;
pub use load::{load_dir, load_from_strs, Loaded, Platform, Warning};
pub use store::ConfigStore;

/// 내장 기본값(TOML).
pub const DEFAULTS: &str = include_str!("default.toml");
