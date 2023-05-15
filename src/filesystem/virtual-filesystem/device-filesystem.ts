import * as constants from "../../constants.js";
// @ts-ignore
import * as vfs from "../../vendor/vfs.js";

import {
  VirtualFilesystem,
  VirtualFilesystemDirectoryDescriptor,
} from "./virtual-filesystem.js";

import { basename } from "../../utils.js";
import { minor as memMinor } from "./mem-devices.js";
import {
  OpenFlags,
  LookupFlags,
  Rights,
  Fdflags,
  Descriptor,
} from "../filesystem.js";

import { DriverManager, major } from "./driver-manager.js";

type DeviceFilesystemOpts = {
  driverManager: DriverManager;
};

export class DeviceFilesystem extends VirtualFilesystem {
  private driverManager: DriverManager;

  override async initialize(opts: Object): Promise<number> {
    const __opts = opts as DeviceFilesystemOpts;
    this.driverManager = __opts.driverManager;
    return constants.WASI_ESUCCESS;
  }
  override async mknodat(
    desc: Descriptor,
    path: string,
    dev: number
  ): Promise<number> {
    let navigated;
    let __desc;
    if (desc === undefined) {
      navigated = this.virtualFs._navigate(path, false);
    } else {
      if (desc instanceof VirtualFilesystemDirectoryDescriptor) {
        __desc = desc as VirtualFilesystemDirectoryDescriptor;
        navigated = this.virtualFs._navigateFrom(__desc.dir, path, false);
      } else {
        return constants.WASI_EINVAL;
      }
    }

    if (navigated.target) {
      return constants.WASI_EEXIST;
    }

    const [_, index] = this.virtualFs._iNodeMgr.createINode(vfs.CharacterDev, {
      mode: vfs.DEFAULT_FILE_PERM,
      uid: 0,
      gid: 0,
      rdev: dev,
      parent: navigated.dir._dir["."],
    });
    navigated.dir.addEntry(path, index);

    const [major_, minor_] = vfs.unmkDev(dev);
    const __driver = this.driverManager.getDriver(major_ as major);
    __driver.initDevice(minor_);

    return constants.WASI_ESUCCESS;
  }

  override async open(
    path: string,
    dirflags: LookupFlags,
    oflags: OpenFlags,
    fs_rights_base: Rights,
    fs_rights_inheriting: Rights,
    fdflags: Fdflags
  ): Promise<{ err: number; index: number; desc: Descriptor }> {
    let result = await super.open(
      path,
      dirflags,
      oflags,
      fs_rights_base,
      fs_rights_inheriting,
      fdflags
    );

    if (result.err !== constants.WASI_ENODEV) {
      return result;
    }

    const navigated = this.virtualFs._navigateFrom(
      (result.desc as VirtualFilesystemDirectoryDescriptor).dir,
      basename(path),
      false
    );

    const [major_, minor_] = vfs.unmkDev(navigated.target._metadata.rdev);

    const driver = this.driverManager.getDriver(major_ as major);
    const { err, constructor_ } = await driver.getDescConstructor(
      minor_ as memMinor
    );
    if (err !== constants.WASI_ESUCCESS) {
      return result;
    }
    return {
      err: constants.WASI_ESUCCESS,
      index: -1,
      desc: new constructor_(
        fdflags,
        fs_rights_base,
        fs_rights_inheriting,
        navigated.target
      ),
    };
  }
}

export async function createDeviceFilesystem(): Promise<DeviceFilesystem> {
  let devfs = new DeviceFilesystem();
  const driverManager = new DriverManager();

  await driverManager.initialize({});
  await devfs.initialize({ driverManager });

  devfs.mknodat(
    undefined,
    "null",
    vfs.mkDev(major.MAJ_MEMORY, memMinor.DEV_NULL)
  );
  devfs.mknodat(
    undefined,
    "zero",
    vfs.mkDev(major.MAJ_MEMORY, memMinor.DEV_ZERO)
  );
  devfs.mknodat(
    undefined,
    "random",
    vfs.mkDev(major.MAJ_MEMORY, memMinor.DEV_RANDOM)
  );

  return devfs;
}
