import * as constants from "./constants.js";
import {arraysEqual} from "./utils.js";
import {FileOrDir, OpenFlags, parsePath} from "./filesystem.js";


export class Filesystem {
    mounts: {parts: string[], name: string, handle: FileSystemDirectoryHandle}[] = [];

    async getRootDirectory(): Promise<Directory> {
        const root = await navigator.storage.getDirectory();
        return new Directory("", root, this);
    }

    async addMount(absolute_path: string, mount_directory: FileSystemDirectoryHandle) {
        // TODO: for now path must be absolute
        const {parts, name} = parsePath(absolute_path);
        this.mounts.push({parts, name, handle: mount_directory});
    }

    removeMount(absolute_path: string) {
        // TODO: for now path must be absolute
        const {parts: del_parts, name: del_name} = parsePath(absolute_path);
        for (let i = 0; i < this.mounts.length; i++) {
            const {parts, name} = this.mounts[i];
            if (arraysEqual(parts, del_parts) && name === del_name) {
                this.mounts.splice(i, 1);
                return;
            }
        }
    }

    async resolve(dir_handle: FileSystemDirectoryHandle, path: string): Promise<{err: number, name: string, dir_handle: FileSystemDirectoryHandle}> {
	if (path.includes("\\")) return { err: constants.WASI_EEXIST, name: null, dir_handle: null };
	const {parts, name} = parsePath(path);
	for (const part of parts) {
            try {
                dir_handle = await this.getDirectoryHandle(dir_handle, part);
            } catch (err) {
                if (err.name === "NotFoundError") {
                    return {err: constants.WASI_ENOENT, name: null, dir_handle: null};
                } else if (err.name === "TypeMismatchError") {
                    return {err: constants.WASI_EEXIST, name: null, dir_handle: null};
                } else if (err.name === "TypeError") {
		    return {err: constants.WASI_EEXIST, name: null, dir_handle: null};
		} else {
                    throw err;
                }
            }
        }
        return {err: constants.WASI_ESUCCESS, name, dir_handle};
    }

    async getDirectoryHandle(handle: FileSystemDirectoryHandle, name: string, options: {create: boolean}={create: false}): Promise<FileSystemDirectoryHandle> {
        const root = await navigator.storage.getDirectory();
        const components = await root.resolve(handle);

        // if there are many mounts for the same path, we want to return the latest
        const reversed_mounts = [].concat(this.mounts).reverse();
        for (const {parts,  name: child_name, handle: child_handle} of reversed_mounts) {
            if (arraysEqual(parts, components) && child_name === name) {
                return child_handle;
            }
        }
        return await handle.getDirectoryHandle(name, options);
    }
    
    async getFileHandle(handle: FileSystemDirectoryHandle, name: string, options: {create: boolean}={create: false}): Promise<FileSystemFileHandle> {
        const root = await navigator.storage.getDirectory();
        const components = await root.resolve(handle);

        // if there are many mounts for the same path, we want to return the latest
        const reversed_mounts = [].concat(this.mounts).reverse();
        for (const {parts,  name: child_name, handle: child_handle} of reversed_mounts) {
            if (arraysEqual(parts, components) && child_name === name) {
                throw TypeError;
            }
        }
        return await handle.getFileHandle(name, options);
    }

    async entries(dir_handle: FileSystemDirectoryHandle): Promise<(File | Directory)[]>  {
        const root = await navigator.storage.getDirectory();
        const components = await root.resolve(dir_handle);

        const a = [];

        const reversed_mounts = [].concat(this.mounts).reverse();
        for (const {parts,  name, handle} of reversed_mounts) {
            if (arraysEqual(parts, components)) {
                switch(handle.kind) {
                    case "file": {
                        a.push(new File(name, handle, this));
                        break;
                    }
                    case "directory": {
                        a.push(new Directory(name, handle, this));
                        break;
                    }
                }
            }
        }

        for await (const [name, handle] of dir_handle.entries()) {
            // mounted direcotries hide directories they are mounted to
            let already_exists = false;
            for (const entry of a) {
                if (entry.path === name) {
                    already_exists = true;
                    break;
                }
            }
            if (already_exists) {
                continue;
            }

            switch(handle.kind) {
                case "file": {
                    a.push(new File(name, handle, this));
                    break;
                }
                case "directory": {
                    a.push(new Directory(name, handle, this));
                    break;
                }
            }
        }
        return a;
    }
}

export class Stdin {

}

abstract class Entry {
    public readonly file_type: number;
    public readonly path: string;
    protected readonly _handle: FileSystemDirectoryHandle | FileSystemFileHandle;
    protected readonly _filesystem: Filesystem;

    constructor(path: string, handle: FileSystemDirectoryHandle | FileSystemFileHandle, filesystem: Filesystem) {
        this.path = path;
        this._handle = handle;
        this._filesystem = filesystem;
    }

    abstract size(): Promise<number>;

    abstract lastModified(): Promise<number>;

    // TODO: fill dummy values with something meaningful
    async stat() {
        console.log(`Entry.stat()`);
        const time = BigInt(await this.lastModified()) * 1_000_000n;
        return {
            dev: 0n,
            ino: 0n,
            file_type: this.file_type,
            nlink: 0n,
            size: BigInt(await this.size()),
            atim: time,
            mtim: time, 
            ctim: time,
        };
    }
}

export class Directory extends Entry {
    public readonly file_type: number = constants.WASI_FILETYPE_DIRECTORY;
    declare _handle: FileSystemDirectoryHandle;

    async size(): Promise<number> {
        return 0;
    }
    
    async entries(): Promise<(File | Directory)[]>  {
        console.log('OpenDirectory.entries()');
        return await this._filesystem.entries(this._handle);
    }

    async lastModified(): Promise<number> {
        const entries = await this.entries();
        const dates = await Promise.all(entries.map(entry => entry.lastModified()));
        return Math.max(...dates);
    }

    open() {
        return new OpenDirectory(this.path, this._handle, this._filesystem);
    }
}

export class OpenDirectory extends Directory {
    public readonly file_type: number = constants.WASI_PREOPENTYPE_DIR;

    // basically copied form RReverser's wasi-fs-access
    async get_entry(path: string, mode: FileOrDir, oflags: OpenFlags = 0): Promise<{err: number, entry: File | Directory}> {
        console.log(`OpenDirectory.get_entry(${path}, ${mode}, ${oflags})`);
    
        let {err, name, dir_handle} = await this._filesystem.resolve(this._handle, path);
        if (err !== constants.WASI_ESUCCESS) {
            return {err, entry: null};
        }    

        if (name === undefined) {
            if (oflags & (OpenFlags.Create | OpenFlags.Exclusive)) {
                return {err: constants.WASI_EEXIST, entry: null};
            }
            if (oflags & OpenFlags.Truncate) {
                return {err: constants.WASI_EISDIR, entry: null};
            }
            return {err: constants.WASI_ESUCCESS, entry: new Directory(this.path, this._handle, this._filesystem)};
        }

        
        if (oflags & OpenFlags.Directory) {
            mode = FileOrDir.Directory;
        }

        const openWithCreate = async (create: boolean): Promise<{err: number, handle: FileSystemFileHandle | FileSystemDirectoryHandle}> => {
            if (mode & FileOrDir.File) {
                try {
                    return {err: constants.WASI_ESUCCESS, handle: await this._filesystem.getFileHandle(dir_handle, name, {create})};
                } catch (err) {
                    if (err.name === 'TypeMismatchError' || err.name == 'TypeError') {
                        if (!(mode & FileOrDir.Directory)) {
                            return {err: constants.WASI_EISDIR, handle: null};
                        }
                    } else if (err.name === 'NotFoundError') {
                        return {err: constants.WASI_ENOENT, handle: null};
                    } else {
                        throw err;
                    }
                }
            }
            try {
                return {err: constants.WASI_ESUCCESS, handle: await this._filesystem.getDirectoryHandle(dir_handle, name, {create})};
            } catch (err) {
                if (err.name === 'TypeMismatchError') {
                    return {err: constants.WASI_ENOTDIR, handle: null};                              
                } else if (err.name === 'NotFoundError') {
                    return {err: constants.WASI_ENOENT, handle: null};
                } else {
                    throw err;
                }
            }
        }

        let handle;
        if (oflags & OpenFlags.Create) {
            if (oflags & OpenFlags.Exclusive) {
                if ((await openWithCreate(false)).err === constants.WASI_ESUCCESS) {
                    return {err: constants.WASI_EEXIST, entry: null};
                }
            }
            ({err, handle} = await openWithCreate(true));
        } else {
            ({err, handle} = await openWithCreate(false));
        }

        if (err !== constants.WASI_ESUCCESS) {
            return {err, entry: null};
        }
                
        if (oflags & OpenFlags.Truncate) {
            if (handle.kind === "directory") {
                return {err: constants.WASI_EISDIR, entry: null};
            }
            const writable = await handle.createWritable();
            writable.write({type: "truncate", size: 0});
            writable.close();
        }

        let entry;
        if (handle.kind == "file") {
            entry = new File(name, handle, this._filesystem);
        } else {
            entry = new Directory(name, handle, this._filesystem);
        }

        return {err: constants.WASI_ESUCCESS, entry};
    }

    async delete_entry(path: string, options): Promise<{err: number}> {
        const {err, name, dir_handle} = await this._filesystem.resolve(this._handle, path);
        await dir_handle.removeEntry(name, options);
        return {err: constants.WASI_ESUCCESS};
    }
}

export class File extends Entry {
    public readonly file_type: number = constants.WASI_FILETYPE_REGULAR_FILE;
    declare protected readonly _handle: FileSystemFileHandle;

    async size(): Promise<number> {
        let file = await this._handle.getFile();
        return file.size;
    }
    
    async lastModified(): Promise<number> {
        let file = await this._handle.getFile();
        return file.lastModified;
    }

    async open() {
        return new OpenFile(this.path, this._handle, this._filesystem);
    }
}

// Represents File opened for reading and writing
// it is backed by File System Access API through a FileSystemFileHandle handle
export class OpenFile extends File {
    public readonly file_type: number = constants.WASI_FILETYPE_REGULAR_FILE;
    private _file_pos: number = 0;

    async read(len: number): Promise<[Uint8Array, number]> {
        console.log(`OpenFile.read(${len})`);
        if (this._file_pos < await this.size()) {
            let file = await this._handle.getFile();
            let slice = new Uint8Array(await file.slice(this._file_pos, this._file_pos + len).arrayBuffer());
            this._file_pos += slice.byteLength;
            return [slice, 0];
        } else {
            return [new Uint8Array(0), 0];
        }
    }

    // TODO: each write creates new writable, store it on creation
    async write(buffer: string) {
        console.log(`OpenFile.write(${buffer})`);
        const w = await this._handle.createWritable();
        await w.write({type: "write", position: this._file_pos, data: buffer});
        await w.close();
        this._file_pos += buffer.length;
        return 0;
    }

    async seek(offset: number, whence: number) {
        console.log(`OpenFile.seek(${offset}, ${whence})`);
        switch (whence) {
            case constants.WASI_WHENCE_SET: {
                this._file_pos = offset;
                break;
            }
            case constants.WASI_WHENCE_CUR: {
                this._file_pos += offset;
                break;
            }
            case constants.WASI_WHENCE_END: {
                this._file_pos = await this.size() + offset;
            }
        }
        // TODO: this only makes sense if we store WritableFileStream on class
        // await w.write({type: "seek", position: offset});
    }

    async truncate() {
        console.log(`OpenFile.truncate()`);
        const w = await this._handle.createWritable();
        await w.write({type: "truncate", size: 0})
        this._file_pos = 0;
    }
}
