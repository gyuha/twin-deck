//! TOML 설정: 내장 기본값 위에 사용자 설정을 깊게 병합하고, 잘못된 부분은 경고로 모은다.
//! 어떤 입력에서도 패닉하지 않고 항상 쓸 수 있는 설정을 돌려준다.

mod columns;
mod config;
mod keybindings;
mod load;
mod merge;
mod store;

pub use columns::{normalize_columns, parse_column, ColumnSpec, SortMarker, COLUMN_NAMES};
pub use config::{
    Behavior, BehaviorLayout, BehaviorTable, Config, ConfirmConfig, Display, Environment,
    FavoriteDto, FavoriteLeaf, FileSystemsConfig, LayoutConfig, QuickSelect, SelectionConfig,
    TableView, ViewConfig, ZipConfig,
};
pub use keybindings::BindingSpec;
pub use load::{load_dir, load_from_strs, Loaded, Platform, Warning};
pub use store::{
    append_favorite, remove_favorite, reset_user_value, set_user_value, ConfigStore, ConfigValue,
};

/// 내장 기본값(TOML).
pub const DEFAULTS: &str = include_str!("default.toml");
