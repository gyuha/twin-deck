//! 운영체제와 무관한 픽셀 처리: Windows 아이콘 비트맵(BGRA, 필요하면 AND 마스크)을 RGBA PNG로 만든다.
//! Windows 코드(`win.rs`)가 쓰지만 순수 함수라 어느 OS에서든 값으로 시험한다.

/// BGRA 바이트를 RGBA로 바꾼다(파란색과 빨간색 자리를 맞바꾼다). 길이가 4의 배수가 아니면 남는 바이트는 버린다.
pub fn bgra_to_rgba(bgra: &[u8]) -> Vec<u8> {
    bgra.chunks_exact(4)
        .flat_map(|p| [p[2], p[1], p[0], p[3]])
        .collect()
}

/// 알파가 하나라도 0이 아니면 이 비트맵은 자기 알파를 가진다.
pub fn has_alpha(bgra: &[u8]) -> bool {
    bgra.chunks_exact(4).any(|p| p[3] != 0)
}

/// 알파가 없는 오래된 아이콘: AND 마스크(32비트로 읽은 BGRA)에서 검정이면 보이는 픽셀(알파 255), 그 밖이면 투명(알파 0)으로 정한다.
/// 마스크가 더 짧으면 그만큼만 바꾼다.
pub fn apply_mask_alpha(bgra: &mut [u8], mask_bgra: &[u8]) {
    for (px, m) in bgra.chunks_exact_mut(4).zip(mask_bgra.chunks_exact(4)) {
        px[3] = if m[0] == 0 && m[1] == 0 && m[2] == 0 {
            255
        } else {
            0
        };
    }
}

/// RGBA 한 장을 PNG로 인코딩한다. 크기와 바이트 수가 맞지 않거나 0이면 `None`이다.
pub fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Option<Vec<u8>> {
    if width == 0 || height == 0 || rgba.len() != (width as usize) * (height as usize) * 4 {
        return None;
    }
    let mut out = Vec::new();
    let mut enc = png::Encoder::new(&mut out, width, height);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    let mut w = enc.write_header().ok()?;
    w.write_image_data(rgba).ok()?;
    w.finish().ok()?;
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bgra_to_rgba_swaps_blue_and_red_only() {
        assert_eq!(
            bgra_to_rgba(&[1, 2, 3, 4, 10, 20, 30, 40]),
            [3, 2, 1, 4, 30, 20, 10, 40]
        );
        // 4의 배수가 아닌 꼬리는 버린다.
        assert_eq!(bgra_to_rgba(&[1, 2, 3, 4, 9]), [3, 2, 1, 4]);
        assert!(bgra_to_rgba(&[]).is_empty());
    }

    #[test]
    fn has_alpha_is_true_when_any_alpha_is_set() {
        assert!(!has_alpha(&[1, 2, 3, 0, 4, 5, 6, 0]));
        assert!(has_alpha(&[1, 2, 3, 0, 4, 5, 6, 1]));
        assert!(!has_alpha(&[]));
    }

    #[test]
    fn apply_mask_alpha_makes_black_visible_and_the_rest_transparent() {
        // 4x4(16픽셀) 중 앞의 4픽셀만 본다: 검정, 흰색, 회색, 검정.
        let mut px: Vec<u8> = (0..16).flat_map(|_| [9, 8, 7, 0]).collect();
        let mut mask: Vec<u8> = Vec::new();
        for m in [
            [0, 0, 0, 0],
            [255, 255, 255, 0],
            [10, 0, 0, 0],
            [0, 0, 0, 0],
        ] {
            mask.extend(m);
        }
        mask.extend((0..12).flat_map(|_| [255u8, 255, 255, 0])); // 나머지 12픽셀은 모두 투명
        apply_mask_alpha(&mut px, &mask);
        let alphas: Vec<u8> = px.chunks_exact(4).map(|p| p[3]).collect();
        assert_eq!(&alphas[..4], &[255, 0, 0, 255]);
        assert!(alphas[4..].iter().all(|a| *a == 0));
        // 색은 건드리지 않는다.
        assert!(px.chunks_exact(4).all(|p| p[..3] == [9, 8, 7]));
    }

    #[test]
    fn apply_mask_alpha_with_a_short_mask_changes_only_that_many_pixels() {
        let mut px = vec![1, 1, 1, 7, 2, 2, 2, 7];
        apply_mask_alpha(&mut px, &[0, 0, 0, 0]);
        assert_eq!(px, [1, 1, 1, 255, 2, 2, 2, 7]);
    }

    #[test]
    fn encode_png_round_trips_a_4x4_image() {
        let rgba: Vec<u8> = (0..16u8)
            .flat_map(|i| [i * 10, 255 - i, i, 128 + i])
            .collect();
        let bytes = encode_png(4, 4, &rgba).unwrap();
        assert_eq!(
            &bytes[..8],
            &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]
        );
        let mut reader = png::Decoder::new(bytes.as_slice()).read_info().unwrap();
        let mut buf = vec![0; reader.output_buffer_size()];
        let info = reader.next_frame(&mut buf).unwrap();
        assert_eq!((info.width, info.height), (4, 4));
        assert_eq!(info.color_type, png::ColorType::Rgba);
        assert_eq!(&buf[..info.buffer_size()], rgba.as_slice());
    }

    #[test]
    fn encode_png_rejects_wrong_sizes() {
        assert_eq!(encode_png(0, 4, &[]), None);
        assert_eq!(encode_png(4, 4, &[0; 10]), None);
        assert_eq!(encode_png(2, 2, &[0; 17]), None);
    }

    #[test]
    fn a_whole_conversion_goes_from_bgra_with_a_mask_to_a_png() {
        // 2x2: 빨강(보임), 파랑(보임), 초록(마스크로 투명), 흰색(보임). BGRA로 읽은 값이다.
        let mut bgra = vec![0, 0, 255, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255, 255, 255, 0];
        let mask = [0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 0, 0, 0, 0, 0];
        assert!(!has_alpha(&bgra));
        apply_mask_alpha(&mut bgra, &mask);
        let rgba = bgra_to_rgba(&bgra);
        assert_eq!(
            rgba,
            [255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 0, 255, 255, 255, 255]
        );
        assert!(encode_png(2, 2, &rgba).is_some());
    }
}
