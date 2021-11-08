import * as constants from "./constants.js";
import * as utils from "./utils.js";

type ptr = number;

// TODO: set the proper types for each callback
type WASICallbacks = {
  // helper
  setModuleInstance: any;

  // custom syscalls
  isatty: (fd: number) => number;

  // official syscalls
  environ_sizes_get: any;
  args_sizes_get: any;
  fd_prestat_get: any;
  fd_fdstat_get: any;
  fd_filestat_get: any;
  fd_read: any;
  fd_write: any;
  fd_prestat_dir_name: any;
  environ_get: any;
  args_get: any;
  poll_oneoff: any;
  proc_exit: any;
  fd_close: any;
  fd_seek: any;
  random_get: any;
  clock_time_get: any;
  fd_readdir: any;
  path_create_directory: any;
  path_filestat_get: any;
  path_link: any;
  path_open: any;
  path_readlink: any;
  path_remove_directory: any;
  path_rename: any;
  path_unlink_file: any;
  sched_yield: any;
  fd_datasync: any;
  fd_filestat_set_size: any;
  fd_sync: any;
  path_symlink: any;
  clock_res_get: any;
  fd_advise: any;
  fd_allocate: any;
  fd_fdstat_set_flags: any;
  fd_fdstat_set_rights: any;
  fd_tell: any;
  fd_filestat_set_times: any;
  fd_pread: any;
  fd_advice: any;
  fd_pwrite: any;
  fd_renumber: any;
  path_filestat_set_times: any;
  proc_raise: any;
  sock_recv: any;
  sock_send: any;
  sock_shutdown: any;
};

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const CPUTIME_START = utils.msToNs(performance.now());

let started: boolean;
let mod: string;
let myself: number;
let args: string[];
let env: Record<string, string>;

onmessage = (e) => {
  if (!started) {
    if (e.data[0] === "start") {
      started = true;
      mod = e.data[1];
      myself = e.data[2];
      args = e.data[3];
      env = e.data[4];
    }
  }
};

// TODO: add class for msg sent to kernel
function send_to_kernel(msg: any) {
  // @ts-ignore
  postMessage([myself, ...msg]);
}

function worker_console_log(msg: any) {
  // you can control debug logs dynamically based on DEBUG env variable
  if (
    env.DEBUG &&
    !(env.DEBUG === "0" || env.DEBUG === "false" || env.DEBUG === "")
  ) {
    send_to_kernel(["console", msg]);
  }
}

function do_exit(exit_code: number) {
  worker_console_log("calling close()");
  send_to_kernel(["exit", exit_code]);
  close();
}

function WASI(): WASICallbacks {
  let moduleInstanceExports: WebAssembly.Exports = null;

  function setModuleInstance(instance: WebAssembly.Instance) {
    moduleInstanceExports = instance.exports;
  }

  function isatty(fd: number): number {
    worker_console_log(`isatty(${fd}`);

    const sbuf = new SharedArrayBuffer(4 + 4); // lock, isatty
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;
    const isatty = new Int32Array(sbuf, 4, 1);

    send_to_kernel(["isatty", [sbuf, fd]]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    return isatty[0];
  }

  function environ_sizes_get(environ_count: ptr, environ_size: ptr) {
    worker_console_log(
      `environ_sizes_get(0x${environ_count.toString(
        16
      )}, 0x${environ_size.toString(16)})`
    );

    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const environ_count_ = Object.keys(env).length;
    view.setUint32(environ_count, environ_count_, true);

    const environ_size_ = Object.entries(env).reduce(
      (sum, [key, val]) => sum + ENCODER.encode(`${key}=${val}\0`).byteLength,
      0
    );
    view.setUint32(environ_size, environ_size_, true);

    return constants.WASI_ESUCCESS;
  }

  function environ_get(environ: ptr, environ_buf: ptr) {
    worker_console_log(
      `environ_get(${environ.toString(16)}, ${environ_buf.toString(16)})`
    );

    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );
    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    Object.entries(env).forEach(([key, val], i) => {
      // set pointer address to beginning of next key value pair
      view.setUint32(environ + i * 4, environ_buf, true);
      // write string describing the variable to WASM memory
      const variable = ENCODER.encode(`${key}=${val}\0`);
      view8.set(variable, environ_buf);
      // calculate pointer to next variable
      environ_buf += variable.byteLength;
    });

    return constants.WASI_ESUCCESS;
  }

  function args_sizes_get(argc: ptr, argvBufSize: ptr) {
    worker_console_log(
      `args_sizes_get(${argc.toString(16)}, ${argvBufSize.toString(16)})`
    );

    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    view.setUint32(argc, args.length, true);
    view.setUint32(
      argvBufSize,
      ENCODER.encode(args.join("")).byteLength + args.length,
      true
    );

    return constants.WASI_ESUCCESS;
  }

  function args_get(argv: ptr, argv_buf: ptr) {
    worker_console_log(`args_get(${argv}, 0x${argv_buf.toString(16)})`);

    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );
    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    args.forEach((arg, i) => {
      // set pointer address to beginning of next key value pair
      view.setUint32(argv + i * 4, argv_buf, true);
      // write string describing the argument to WASM memory
      const variable = ENCODER.encode(`${arg}\0`);
      view8.set(variable, argv_buf);
      // calculate pointer to next variable
      argv_buf += variable.byteLength;
    });

    return constants.WASI_ESUCCESS;
  }

  function fd_fdstat_get(fd: number, buf: ptr) {
    worker_console_log(`fd_fdstat_get(${fd}, 0x${buf.toString(16)})`);

    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const sbuf = new SharedArrayBuffer(4 + 20); // lock, filetype, rights base, rights inheriting
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;
    const file_type = new Uint8Array(sbuf, 4, 1);
    const rights_base = new BigUint64Array(sbuf, 8, 1);
    const rights_inheriting = new BigUint64Array(sbuf, 16, 1);

    send_to_kernel(["fd_fdstat_get", [sbuf, fd]]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    if (err !== constants.WASI_ESUCCESS) {
      worker_console_log(`fd_fdstat_get returned ${err}`);
      return err;
    }

    view.setUint8(buf, file_type[0]);
    if (fd <= 2) {
      view.setUint32(buf + 2, constants.WASI_FDFLAG_APPEND, true);
    } else {
      view.setUint32(buf + 2, 0, true);
    }
    view.setBigUint64(buf + 8, rights_base[0], true);
    view.setBigUint64(buf + 16, rights_inheriting[0], true);

    worker_console_log(`fd_fdstat_get returned ${err}`);
    return constants.WASI_ESUCCESS;
  }

  function fd_write(fd: number, iovs: ptr, iovs_len: number, nwritten: ptr) {
    worker_console_log(`fd_write(${fd}, ${iovs}, ${iovs_len}, ${nwritten})`);
    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    let written = 0;
    const bufferBytes: number[] = [];

    const buffers = Array.from({ length: iovs_len }, (_, i) => {
      const ptr_pos = iovs + i * 8;
      const buf = view.getUint32(ptr_pos, true);
      const bufLen = view.getUint32(ptr_pos + 4, true);

      return new Uint8Array(
        (moduleInstanceExports.memory as WebAssembly.Memory).buffer,
        buf,
        bufLen
      );
    });
    buffers.forEach((iov: Uint8Array) => {
      for (let b = 0; b < iov.byteLength; b += 1) {
        bufferBytes.push(iov[b]);
      }
      written += iov.byteLength;
    });

    // TODO: this might potentially cause stack overflow if bufferBytes is large, we should definitely write in chunks
    // const content = String.fromCharCode(...bufferBytes);
    const content = new SharedArrayBuffer(written);
    const content_view = new Uint8Array(content);
    for (let i = 0; i < written; i += 1) content_view[i] = bufferBytes[i]; // TODO
    const sbuf = new SharedArrayBuffer(4);
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;
    send_to_kernel(["fd_write", [sbuf, fd, content]]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    if (err === 0) {
      worker_console_log(`fd_write written ${written} bytes.`);
      view.setUint32(nwritten, written, true);
    } else {
      worker_console_log("fd_write ERROR!.");
    }
    return err;
  }

  function proc_exit(exit_code: number) {
    worker_console_log(`proc_exit(${exit_code})`);
    do_exit(exit_code);
  }

  function random_get(buf_addr: ptr, buf_len: number) {
    worker_console_log(`random_get(${buf_addr}, ${buf_len})`);
    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );
    const numbers = new Uint8Array(buf_len);
    crypto.getRandomValues(numbers);
    view8.set(numbers, buf_addr);
    return constants.WASI_ESUCCESS;
  }

  function clock_res_get(clock_id: number) {
    worker_console_log(`clock_res_get(${clock_id})`);
    return 1; // TODO!!!!
  }

  function clock_time_get(clockId: number, precision: number, time: ptr) {
    worker_console_log(`clock_time_get(${clockId}, ${precision}, ${time})`);
    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    view.setBigUint64(time, utils.now(clockId, CPUTIME_START), true);
    return constants.WASI_ESUCCESS;
  }

  function fd_close(fd: number) {
    worker_console_log(`fd_close(${fd})`);

    const sbuf = new SharedArrayBuffer(4);
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;
    send_to_kernel(["fd_close", [sbuf, fd]]);
    Atomics.wait(lck, 0, -1);

    return Atomics.load(lck, 0);
  }

  function fd_filestat_get(fd: number, buf: ptr) {
    worker_console_log(`fd_filestat_get(${fd}, 0x${buf.toString(16)})`);

    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const sbuf = new SharedArrayBuffer(4 + 64); // lock, stat buffer
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;
    const statbuf = new DataView(sbuf, 4);

    send_to_kernel(["fd_filestat_get", [sbuf, fd]]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    worker_console_log(`fd_filestat_get returned ${err}`);
    if (err !== constants.WASI_ESUCCESS) {
      return err;
    }

    const dev = statbuf.getBigUint64(0, true);
    const ino = statbuf.getBigUint64(8, true);
    const file_type = statbuf.getUint8(16);
    const nlink = statbuf.getBigUint64(24, true);
    const size = statbuf.getBigUint64(32, true);
    const atim = statbuf.getBigUint64(38, true);
    const mtim = statbuf.getBigUint64(46, true);
    const ctim = statbuf.getBigUint64(52, true);

    view.setBigUint64(buf, dev, true);
    view.setBigUint64(buf + 8, ino, true);
    view.setUint8(buf + 16, file_type);
    view.setBigUint64(buf + 24, nlink, true);
    view.setBigUint64(buf + 32, size, true);
    view.setBigUint64(buf + 38, atim, true);
    view.setBigUint64(buf + 46, mtim, true);
    view.setBigUint64(buf + 52, ctim, true);

    return constants.WASI_ESUCCESS;
  }

  function fd_read(fd: number, iovs: ptr, iovs_len: number, nread: ptr) {
    if (fd > 2)
      worker_console_log(`fd_read(${fd}, ${iovs}, ${iovs_len}, ${nread})`);
    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );
    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    let read = 0;
    for (let i = 0; i < iovs_len; i += 1) {
      const addr = view.getUint32(iovs + 8 * i, true);
      const len = view.getUint32(iovs + 8 * i + 4, true);

      // TODO: ripe for optimisation, addr and len could be put inside a vector and requested all at once
      const sbuf = new SharedArrayBuffer(4 + 4 + len); // lock, read length, read buffer
      const lck = new Int32Array(sbuf, 0, 1);
      lck[0] = -1;
      const readlen = new Int32Array(sbuf, 4, 1);
      const readbuf = new Uint8Array(sbuf, 8, len);

      send_to_kernel(["fd_read", [sbuf, fd, len]]);
      Atomics.wait(lck, 0, -1);

      const err = Atomics.load(lck, 0);
      if (err !== constants.WASI_ESUCCESS) {
        return err;
      }

      view8.set(readbuf, addr);
      read += readlen[0];
    }
    if (fd > 2) worker_console_log(`fd_read read ${read} bytes.`);
    view.setUint32(nread, read, true);

    return constants.WASI_ESUCCESS;
  }

  function fd_readdir(
    fd: number,
    buf: ptr,
    buf_len: number,
    cookie: number,
    bufused: ptr
  ) {
    worker_console_log(
      `fd_readdir(${fd}, ${buf}, ${buf_len}, ${cookie}, ${bufused})`
    );

    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );
    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const sbuf = new SharedArrayBuffer(4 + 4 + buf_len); // lock, buf_used, buf
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;
    const buf_used = new Uint32Array(sbuf, 4, 1);
    const databuf = new Uint8Array(sbuf, 8);

    send_to_kernel(["fd_readdir", [sbuf, fd, cookie, buf_len]]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    if (err !== constants.WASI_ESUCCESS) {
      return err;
    }

    view8.set(databuf, buf);
    view.setUint32(bufused, buf_used[0], true);

    return constants.WASI_ESUCCESS;
  }

  function fd_seek(
    fd: number,
    offset: BigInt,
    whence: number,
    new_offset: ptr
  ) {
    worker_console_log(`fd_seek(${fd}, ${offset}, ${whence}, ${new_offset})`);
    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const sbuf = new SharedArrayBuffer(4 + 4 + 8); // lock, _padding, file_pos
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;
    const file_pos = new BigUint64Array(sbuf, 8, 1);

    send_to_kernel(["fd_seek", [sbuf, fd, offset, whence]]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    worker_console_log(`fd_seek returned ${err}, file_pos = ${file_pos[0]}`);
    if (err !== constants.WASI_ESUCCESS) {
      return err;
    }

    view.setBigUint64(new_offset, file_pos[0], true);
    return constants.WASI_ESUCCESS;
  }

  function path_create_directory(fd: number, path_ptr: ptr, path_len: number) {
    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const path = DECODER.decode(view8.slice(path_ptr, path_ptr + path_len));

    worker_console_log(
      `path_create_directory(${fd}, ${path}, ${path_len}) [path=${path}]`
    );

    const sbuf = new SharedArrayBuffer(4); // lock
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;

    send_to_kernel(["path_create_directory", [sbuf, fd, path]]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    return err;
  }

  function path_filestat_get(
    fd: number,
    flags: number,
    path_ptr: ptr,
    path_len: number,
    buf: ptr
  ) {
    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );
    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const path = DECODER.decode(view8.slice(path_ptr, path_ptr + path_len));

    worker_console_log(
      `path_filestat_get(${fd}, ${flags}, ${path}, ${path_len}, 0x${buf.toString(
        16
      )}) [path=${path}]`
    );

    const sbuf = new SharedArrayBuffer(4 + 64); // lock, stat buffer
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;
    const statbuf = new DataView(sbuf, 4);

    send_to_kernel(["path_filestat_get", [sbuf, fd, path, flags]]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    worker_console_log(`path_filestat_get returned ${err}`);
    if (err !== constants.WASI_ESUCCESS) {
      return err;
    }

    const dev = statbuf.getBigUint64(0, true);
    const ino = statbuf.getBigUint64(8, true);
    const file_type = statbuf.getUint8(16);
    const nlink = statbuf.getBigUint64(24, true);
    const size = statbuf.getBigUint64(32, true);
    const atim = statbuf.getBigUint64(40, true);
    const mtim = statbuf.getBigUint64(48, true);
    const ctim = statbuf.getBigUint64(56, true);

    view.setBigUint64(buf, dev, true);
    view.setBigUint64(buf + 8, ino, true);
    view.setUint8(buf + 16, file_type);
    view.setBigUint64(buf + 24, nlink, true);
    view.setBigUint64(buf + 32, size, true);
    view.setBigUint64(buf + 40, atim, true);
    view.setBigUint64(buf + 48, mtim, true);
    view.setBigUint64(buf + 56, ctim, true);

    return constants.WASI_ESUCCESS;
  }

  function path_open(
    dir_fd: number,
    dirflags: number,
    path_ptr: ptr,
    path_len: number,
    oflags: number,
    fs_rights_base: number,
    fs_rights_inheriting: number,
    fdflags: number,
    opened_fd_ptr: ptr
  ) {
    worker_console_log(
      `path_open(${dir_fd}, ${dirflags}, 0x${path_ptr.toString(
        16
      )}, ${path_len}, ${oflags}, ${fs_rights_base}, ${fs_rights_inheriting}, ${fdflags}, 0x${opened_fd_ptr.toString(
        16
      )})`
    );
    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );
    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const path = DECODER.decode(view8.slice(path_ptr, path_ptr + path_len));
    worker_console_log(`path_open: path = ${path}`);

    const sbuf = new SharedArrayBuffer(4 + 4); // lock, opened fd
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;
    const opened_fd = new Int32Array(sbuf, 4, 1);
    send_to_kernel([
      "path_open",
      [
        sbuf,
        dir_fd,
        path,
        dirflags,
        oflags,
        fs_rights_base,
        fs_rights_inheriting,
        fdflags,
      ],
    ]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    if (err !== constants.WASI_ESUCCESS) {
      return err;
    }

    view.setUint32(opened_fd_ptr, opened_fd[0], true);
    return constants.WASI_ESUCCESS;
  }

  // used solely in path_readlink
  function special_parse(fullcmd: string): string {
    const [cmd, args_string, env_string, background, redirects_string] =
      fullcmd.split("\x1b\x1b");
    const isJob = background === "true";
    switch (cmd) {
      case "spawn": {
        // reparse args
        const args = args_string.split("\x1b");
        const new_env = Object.fromEntries(
          env_string.split("\x1b").map((kv) => kv.split("="))
        );
        const extended_env = { ...env, ...new_env };
        const redirects = redirects_string
          .split("\x1b")
          .filter((s) => s.length)
          .map((redirect) => {
            const [fd, path, mode] = redirect.split(" ");
            return [parseInt(fd, 10), path, mode];
          });
        const sbuf = new SharedArrayBuffer(4);
        const lck = new Int32Array(sbuf, 0, 1);
        lck[0] = -1;
        send_to_kernel([
          "spawn",
          [args[0], args.slice(1), extended_env, sbuf, isJob, redirects],
        ]);
        // wait for child process to finish
        Atomics.wait(lck, 0, -1);
        const err = Atomics.load(lck, 0);
        if (err !== constants.WASI_ESUCCESS) {
          worker_console_log(`error: spawned process returned ${err}`);
          return `${constants.EXIT_FAILURE}\x1b`;
        }
        return `${constants.EXIT_SUCCESS}\x1b`;
      }
      case "set_env": {
        const sbuf = new SharedArrayBuffer(4);
        const lck = new Int32Array(sbuf, 0, 1);
        lck[0] = -1;

        const args = args_string.split("\x1b");
        send_to_kernel(["set_env", [args, sbuf]]);
        if (args.length === 1) {
          delete env[args[0]];
          return `${constants.EXIT_SUCCESS}\x1b`;
        }
        env[args[0]] = args[1];
        if (args[0] === "PWD") {
          env[args[0]] = utils.realpath(env[args[0]]);
          lck[0] = -1;
          send_to_kernel(["chdir", [utils.realpath(env[args[0]]), sbuf]]);
        }
        worker_console_log(`set ${args[0]} to ${env[args[0]]}`);
        return `${constants.EXIT_SUCCESS}\x1b${env[args[0]]}`;
      }
      case "set_echo": {
        const sbuf = new SharedArrayBuffer(4);
        const lck = new Int32Array(sbuf, 0, 1);
        lck[0] = -1;
        send_to_kernel(["set_echo", [args_string, sbuf]]);
        Atomics.wait(lck, 0, -1);
        return `${constants.EXIT_SUCCESS}\x1b`;
      }
      case "isatty": {
        const sbuf = new SharedArrayBuffer(8);
        const lck = new Int32Array(sbuf, 0, 1);
        lck[0] = -1;
        const isatty = new Int32Array(sbuf, 4, 1);
        const fd = parseInt(args_string, 10);
        send_to_kernel(["isatty", [sbuf, fd]]);
        Atomics.wait(lck, 0, -1);
        return `${constants.EXIT_SUCCESS}\x1b${isatty[0]}`;
      }
    }

    worker_console_log(`Special command ${cmd} not found.`);
    return `${constants.EXIT_CMD_NOT_FOUND}\x1b`;
  }

  function path_readlink(
    fd: number,
    path_ptr: ptr,
    path_len: number,
    buffer_ptr: ptr,
    buffer_len: number,
    buffer_used_ptr: ptr
  ) {
    worker_console_log(
      `path_readlink(${fd}, ${path_ptr}, ${path_len}, ${buffer_ptr}, ${buffer_len}, ${buffer_used_ptr})`
    );
    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );
    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );
    const path = DECODER.decode(view8.slice(path_ptr, path_ptr + path_len));
    worker_console_log(
      `path is ${path}, buffer_len = ${buffer_len}, fd = ${fd}`
    );
    if (path[0] === "!") {
      if (buffer_len < 1024) {
        // we need enough buffer to execute the function only once
        view.setUint32(buffer_used_ptr, buffer_len, true);
        return constants.WASI_ESUCCESS;
      }
      const result = ENCODER.encode(`${special_parse(path.slice(1))}\0`);
      let count = result.byteLength;
      if (count > 1024) count = 1024;
      view8.set(result.slice(0, count), buffer_ptr);
      view.setUint32(buffer_used_ptr, count, true);
      return constants.WASI_ESUCCESS;
    }
    return constants.WASI_EBADF;
  }

  function path_remove_directory(fd: number, path_ptr: ptr, path_len: number) {
    worker_console_log(
      `path_remove_directory(${fd}, ${path_ptr}, ${path_len})`
    );

    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const path = DECODER.decode(view8.slice(path_ptr, path_ptr + path_len));

    const sbuf = new SharedArrayBuffer(4); // lock
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;

    send_to_kernel(["path_remove_directory", [sbuf, fd, path]]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    return err;
  }

  function path_rename() {
    worker_console_log("path_rename");
    return 1;
  }

  function path_unlink_file(fd: number, path_ptr: ptr, path_len: number) {
    worker_console_log(`path_unlink_file(${fd}, ${path_ptr}, ${path_len})`);

    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const path = DECODER.decode(view8.slice(path_ptr, path_ptr + path_len));

    const sbuf = new SharedArrayBuffer(4); // lock
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;

    send_to_kernel(["path_unlink_file", [sbuf, fd, path]]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    return err;
  }

  function sched_yield() {
    worker_console_log("sched_yield");
    return 1;
  }

  function fd_prestat_get(fd: number, buf: ptr) {
    worker_console_log(`fd_prestat_get(${fd}, 0x${buf.toString(16)})`);
    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const sbuf = new SharedArrayBuffer(4 + 4 + 1); // lock, name length, preopen_type
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;
    const name_len = new Int32Array(sbuf, 4, 1);
    const preopen_type = new Uint8Array(sbuf, 8, 1);

    send_to_kernel(["fd_prestat_get", [sbuf, fd]]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    if (err === constants.WASI_ESUCCESS) {
      view.setUint8(buf, preopen_type[0]);
      view.setUint32(buf + 4, name_len[0], true);
      worker_console_log(
        `fd_prestat_get returned preonepend type ${preopen_type[0]} of size ${name_len[0]}`
      );
    } else {
      worker_console_log(`fd_prestat_get returned ${err}`);
    }
    return err;
  }

  function fd_prestat_dir_name(fd: number, path_ptr: ptr, path_len: number) {
    worker_console_log(
      `fd_prestat_dir_name(${fd}, 0x${path_ptr.toString(16)}, ${path_len})`
    );
    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const sbuf = new SharedArrayBuffer(4 + path_len); // lock, path
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;
    const path = new Uint8Array(sbuf, 4, path_len);

    send_to_kernel(["fd_prestat_dir_name", [sbuf, fd, path_len]]);
    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);
    if (err === constants.WASI_ESUCCESS) {
      view8.set(path, path_ptr);
    }
    const path_str = DECODER.decode(view8.slice(path_ptr, path_ptr + path_len));
    worker_console_log(
      `prestat returned ${err}, "${path_str}" of size ${path_len}`
    );
    return err;
  }

  function fd_datasync() {
    worker_console_log("fd_datasync");
    return constants.WASI_ESUCCESS;
  }

  function fd_filestat_set_size() {
    worker_console_log("fd_filestat_set_size");
    return constants.WASI_ESUCCESS;
  }

  function fd_sync() {
    worker_console_log("fd_sync");
    return constants.WASI_ESUCCESS;
  }

  function path_symlink(
    path_ptr: ptr,
    path_len: number,
    fd: number,
    newpath_ptr: ptr,
    newpath_len: number
  ) {
    worker_console_log(
      `path_symlink(0x${path_ptr.toString(
        16
      )}, ${path_len}, ${fd}, 0x${newpath_ptr.toString(16)}, ${newpath_len})`
    );
    const view8 = new Uint8Array(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    const path = DECODER.decode(view8.slice(path_ptr, path_ptr + path_len));
    const newpath = DECODER.decode(
      view8.slice(newpath_ptr, newpath_ptr + newpath_len)
    );
    worker_console_log(`path_symlink: ${newpath} --> ${path}`);

    const sbuf = new SharedArrayBuffer(4); // lock
    const lck = new Int32Array(sbuf, 0, 1);
    lck[0] = -1;

    send_to_kernel(["path_symlink", [sbuf, path, fd, newpath]]);

    Atomics.wait(lck, 0, -1);

    const err = Atomics.load(lck, 0);

    return err;
  }

  function poll_oneoff(
    sin: ptr,
    sout: ptr,
    nsubscriptions: number,
    nevents: ptr
  ) {
    worker_console_log(
      `poll_oneoff(${sin}, ${sout}, ${nsubscriptions}, ${nevents})`
    );
    const view = new DataView(
      (moduleInstanceExports.memory as WebAssembly.Memory).buffer
    );

    let eventc = 0;
    let waitEnd = 0n;
    for (let i = 0; i < nsubscriptions; i += 1) {
      const userdata = view.getBigUint64(sin, true);
      sin += 8;
      const eventType = view.getUint8(sin);
      sin += 1;
      switch (eventType) {
        case constants.WASI_EVENTTYPE_CLOCK: {
          sin += 7;
          const identifier = view.getBigUint64(sin, true);
          sin += 8;
          const clockid = view.getUint32(sin, true);
          sin += 8;
          const timestamp = view.getBigUint64(sin, true);
          sin += 8;
          const precision = view.getBigUint64(sin, true);
          sin += 8;
          const subclockflags = view.getUint16(sin, true);
          sin += 8;

          const absolute = subclockflags === 1;

          worker_console_log(
            `identifier = ${identifier}, clockid = ${clockid}, timestamp = ${timestamp}, precision = ${precision}, absolute = ${absolute}`
          );

          const n = utils.now(clockid, CPUTIME_START);
          const end = absolute ? timestamp : n + timestamp;
          waitEnd = end > waitEnd ? end : waitEnd;

          view.setBigUint64(sout, userdata, true);
          sout += 8;
          view.setUint16(sout, constants.WASI_ESUCCESS, true); // error
          sout += 2; // pad offset 2
          view.setUint8(sout, constants.WASI_EVENTTYPE_CLOCK);
          sout += 6; // pad offset 3

          eventc += 1;

          break;
        }
        case constants.WASI_EVENTTYPE_FD_READ:
        case constants.WASI_EVENTTYPE_FD_WRITE: {
          sin += 3; // padding
          view.getUint32(sin, true);
          sin += 4;

          view.setBigUint64(sout, userdata, true);
          sout += 8;
          view.setUint16(sout, constants.WASI_ENOSYS, true); // error
          sout += 2; // pad offset 2
          view.setUint8(sout, eventType);
          sout += 1; // pad offset 3
          sout += 5; // padding to 8

          eventc += 1;

          break;
        }
        default:
          return constants.WASI_EINVAL;
      }
    }

    view.setUint32(nevents, eventc, true);

    while (utils.msToNs(performance.now()) < waitEnd) {
      // nothing
    }

    return constants.WASI_ESUCCESS;
  }

  const placeholder = () => {
    worker_console_log(
      `> Entering stub ${new Error().stack.split("\n")[2].trim().split(" ")[1]}`
    );
    return constants.WASI_ESUCCESS;
  };

  function fd_advice() {
    return placeholder();
  }

  function fd_allocate() {
    return placeholder();
  }

  function fd_fdstat_set_rights() {
    return placeholder();
  }

  function fd_fdstat_set_flags() {
    return placeholder();
  }

  function fd_pwrite() {
    return placeholder();
  }

  function fd_renumber() {
    return placeholder();
  }

  function fd_tell() {
    return placeholder();
  }

  function path_filestat_set_times() {
    return placeholder();
  }

  function proc_raise() {
    return placeholder();
  }

  function sock_recv() {
    return placeholder();
  }

  function sock_send() {
    return placeholder();
  }

  function sock_shutdown() {
    return placeholder();
  }

  function path_link() {
    return placeholder();
  }

  function fd_advise() {
    return placeholder();
  }

  function fd_filestat_set_times() {
    return placeholder();
  }

  function fd_pread() {
    return placeholder();
  }

  return {
    setModuleInstance,

    isatty,

    environ_sizes_get,
    args_sizes_get,
    fd_prestat_get,
    fd_fdstat_get,
    fd_filestat_get,
    fd_read,
    fd_write,
    fd_prestat_dir_name,
    environ_get,
    args_get,
    poll_oneoff,
    proc_exit,
    fd_close,
    fd_seek,
    random_get,
    clock_time_get,
    fd_readdir,
    path_create_directory,
    path_filestat_get,
    path_link,
    path_open,
    path_readlink,
    path_remove_directory,
    path_rename,
    path_unlink_file,
    sched_yield,
    fd_datasync,
    fd_filestat_set_size,
    fd_sync,
    path_symlink,
    clock_res_get,
    fd_advise,
    fd_allocate,
    fd_fdstat_set_flags,
    fd_fdstat_set_rights,
    fd_tell,
    fd_filestat_set_times,
    fd_pread,
    fd_advice,
    fd_pwrite,
    fd_renumber,
    path_filestat_set_times,
    proc_raise,
    sock_recv,
    sock_send,
    sock_shutdown,
  };
}

async function importWasmModule(
  module: WebAssembly.Module,
  wasiCallbacksConstructor: () => WASICallbacks
) {
  const wasiCallbacks = wasiCallbacksConstructor();
  const moduleImports = {
    wasi_snapshot_preview1: wasiCallbacks,
    wasi_unstable: wasiCallbacks,
  };

  if (WebAssembly.instantiate) {
    worker_console_log("WebAssembly.instantiate");

    const instance = await WebAssembly.instantiate(module, moduleImports);

    wasiCallbacks.setModuleInstance(instance);
    try {
      // @ts-ignore
      instance.exports._start();
      do_exit(0);
    } catch (e) {
      worker_console_log(`error: ${e}`);
      send_to_kernel(["stderr", `${e.stack}\n`]);
      do_exit(255);
    }
  } else {
    worker_console_log("WebAssembly.instantiate is not supported");
  }
}

async function start_wasm() {
  if (started && mod) {
    worker_console_log("Loading a module");
    try {
      await importWasmModule(mod, WASI);
    } catch (err) {
      worker_console_log(`Failed instantiating WASM module: ${err}`);
      send_to_kernel(["stderr", `Failed instantiating WASM module: ${err}`]);
      do_exit(255);
    }
    worker_console_log("done.");
  } else {
    setTimeout(() => {
      start_wasm();
    }, 0);
  }
}

try {
  (async () => await start_wasm())();
} catch (err) {
  send_to_kernel(["console", `Worker failed: ${err}`]);
}
