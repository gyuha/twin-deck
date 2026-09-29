use std::cell::RefCell;
use std::path::Path;
use std::rc::Rc;

use td_volumes::{list_volumes, parse_mountinfo, UnmountError, Unmounter, Volume, Volumes};

#[test]
fn volumes_list_mounts() {
    // 현재 OS의 실제 마운트: 루트가 있고 모든 항목이 이름과 존재하는 경로를 가진다.
    let vols = list_volumes();
    assert!(!vols.is_empty());
    if cfg!(unix) {
        assert_eq!(vols[0].mount_point, "/", "루트가 첫 항목");
        assert!(
            vols.iter().filter(|v| v.mount_point == "/").count() == 1,
            "루트는 한 번만"
        );
    }
    for v in &vols {
        assert!(!v.name.is_empty(), "{v:?}");
        assert!(Path::new(&v.mount_point).exists(), "{v:?}");
    }
}

const MOUNTINFO: &str = "\
22 28 0:21 / /sys rw,nosuid shared:7 - sysfs sysfs rw
23 28 0:22 / /proc rw,nosuid shared:13 - proc proc rw
28 1 8:2 / / rw,relatime shared:1 - ext4 /dev/sda2 rw
31 28 0:26 / /run rw,nosuid shared:24 - tmpfs tmpfs rw,mode=755
40 28 8:1 / /boot/efi rw,relatime shared:60 - vfat /dev/sda1 rw
55 28 8:17 / /media/user/My\\040Disk rw,relatime shared:80 - exfat /dev/sdb1 rw
56 28 8:33 / /run/media/user/USB rw,relatime shared:81 - vfat /dev/sdc1 rw
57 28 0:50 / /mnt/nas rw,relatime shared:90 - nfs4 server:/export rw
58 28 0:51 / /snap/core/1 ro,relatime shared:91 - squashfs /dev/loop0 ro
59 28 8:2 / / rw,relatime shared:1 - ext4 /dev/sda2 rw
";

#[test]
fn parse_mountinfo_keeps_real_volumes_only() {
    let vols = parse_mountinfo(MOUNTINFO);
    let points: Vec<&str> = vols.iter().map(|v| v.mount_point.as_str()).collect();
    assert_eq!(
        points,
        [
            "/",
            "/media/user/My Disk",
            "/run/media/user/USB",
            "/mnt/nas"
        ],
        "가상 파일시스템, /run·/boot·/snap 시스템 마운트, 중복은 제외하고 이스케이프는 푼다"
    );
    assert_eq!(vols[1].name, "My Disk");
    assert_eq!(vols[0].name, "/");
    assert!(parse_mountinfo("").is_empty());
    assert!(parse_mountinfo("garbage\n\n").is_empty());
}

type Log = Rc<RefCell<Vec<String>>>;

struct Recorder(Log);
impl Unmounter for Recorder {
    fn unmount(&self, mp: &str) -> Result<(), UnmountError> {
        self.0.borrow_mut().push(format!("unmount {mp}"));
        Ok(())
    }
    fn eject(&self, mp: &str) -> Result<(), UnmountError> {
        self.0.borrow_mut().push(format!("eject {mp}"));
        Ok(())
    }
}

fn fake_list() -> Vec<Volume> {
    vec![
        Volume {
            name: "/".into(),
            mount_point: "/".into(),
        },
        Volume {
            name: "USB".into(),
            mount_point: "/Volumes/USB".into(),
        },
    ]
}

#[test]
fn unmount_requests_go_through_the_trait_with_guards() {
    let log: Log = Rc::default();
    let v = Volumes::with_lister(Recorder(log.clone()), fake_list);
    v.unmount("/Volumes/USB").unwrap();
    v.eject("/Volumes/USB").unwrap();
    assert_eq!(
        *log.borrow(),
        ["unmount /Volumes/USB", "eject /Volumes/USB"]
    );

    // 루트, 목록에 없는 경로는 거부되고 unmounter까지 가지 않는다.
    assert!(matches!(v.unmount("/"), Err(UnmountError::Root)));
    assert!(matches!(v.eject("/"), Err(UnmountError::Root)));
    assert!(matches!(
        v.unmount("/etc"),
        Err(UnmountError::NotAVolume(_))
    ));
    assert!(matches!(
        v.eject("/Volumes/Other"),
        Err(UnmountError::NotAVolume(_))
    ));
    assert_eq!(log.borrow().len(), 2, "거부된 요청은 기록되지 않는다");
}
