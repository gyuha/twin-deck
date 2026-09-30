//! 심볼릭 링크를 만들지 못했을 때의 원인과 안내 문구 (OP-12, docs/09).

/// 운영체제 오류 코드를 사람이 이해할 수 있는 안내로 바꾼다. 안내가 필요한 알려진 코드가 아니면 None.
/// `windows`: 코드가 Windows 오류 코드인지(true) 유닉스 errno인지(false).
pub fn symlink_error_message(windows: bool, code: i32) -> Option<&'static str> {
    if windows {
        Some(match code {
            // ERROR_PRIVILEGE_NOT_HELD
            1314 => "심볼릭 링크를 만들 권한이 없습니다. Windows에서는 설정에서 개발자 모드를 켜거나 관리자 권한으로 실행해야 합니다",
            // ERROR_ACCESS_DENIED
            5 => "접근이 거부되었습니다. 대상 폴더의 쓰기 권한을 확인하세요 (Windows에서는 개발자 모드나 관리자 권한도 필요할 수 있습니다)",
            // ERROR_NOT_SUPPORTED, ERROR_INVALID_FUNCTION: FAT/exFAT 등 링크를 지원하지 않는 파일시스템
            50 | 1 => "이 파일시스템은 심볼릭 링크를 지원하지 않습니다 (FAT/exFAT 볼륨 등)",
            // ERROR_ALREADY_EXISTS, ERROR_FILE_EXISTS
            183 | 80 => "같은 이름이 이미 있습니다",
            // ERROR_PATH_NOT_FOUND, ERROR_FILE_NOT_FOUND
            3 | 2 => "대상 폴더를 찾을 수 없습니다",
            // ERROR_INVALID_PARAMETER (예: 지원하지 않는 링크 종류)
            87 => "링크를 만들 수 없는 위치이거나 잘못된 경로입니다",
            _ => return None,
        })
    } else {
        Some(match code {
            // EPERM, EACCES
            1 | 13 => "링크를 만들 권한이 없습니다. 대상 폴더의 쓰기 권한을 확인하세요",
            // EEXIST
            17 => "같은 이름이 이미 있습니다",
            // ENOENT
            2 => "대상 폴더를 찾을 수 없습니다",
            // EROFS
            30 => "읽기 전용 볼륨이라 링크를 만들 수 없습니다",
            // ENAMETOOLONG (Linux 36, macOS 63)
            36 | 63 => "이름이 너무 깁니다",
            _ => return None,
        })
    }
}
