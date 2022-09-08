#!/usr/bin/wash
echo "downloading tree..."
wget resources/tree.wasm /usr/bin/tree
echo "downloading nohup..."
wget resources/nohup.wasm /usr/bin/nohup
echo "downloading uutils..."
wget resources/uutils.async.wasm /usr/bin/uutils
echo "downloading syscalls_test..."
wget resources/syscalls_test.wasm /usr/local/bin/syscalls_test
echo "downloading python..."
wget resources/python.wasm /usr/local/bin/python
echo "downloading python libs..."
wget resources/python.zip /lib/python.zip
echo "downloading duk..."
wget https://registry-cdn.wapm.io/contents/_/duktape/0.0.3/build/duk.wasm /usr/local/bin/duk
echo "downloading cowsay..."
wget https://registry-cdn.wapm.io/contents/_/cowsay/0.2.0/target/wasm32-wasi/release/cowsay.wasm /usr/local/bin/cowsay
echo "downloading qjs..."
wget https://registry-cdn.wapm.io/contents/adamz/quickjs/0.20210327.0/build/qjs.wasm /usr/local/bin/qjs
echo "downloading viu..."
wget https://registry-cdn.wapm.io/contents/_/viu/0.2.3/target/wasm32-wasi/release/viu.wasm /usr/local/bin/viu
echo "downloading rustpython..."
wget https://registry-cdn.wapm.io/contents/_/rustpython/0.1.3/target/wasm32-wasi/release/rustpython.wasm /usr/local/bin/rustpython
echo "downloading grep..."
wget https://registry-cdn.wapm.io/contents/liftm/rg/12.1.1-1/rg.wasm /usr/local/bin/grep
echo "downloading find..."
wget https://registry-cdn.wapm.io/contents/liftm/fd/8.2.1-1/fd.wasm /usr/local/bin/find
echo "downloading du..."
wget https://registry-cdn.wapm.io/contents/liftm/dust-wasi/0.5.4-3/dust.wasm /usr/local/bin/du
echo "downloading llc..."
wget https://registry-cdn.wapm.io/contents/rapidlua/llc/0.0.4/llc.wasm /usr/local/bin/llc
echo "downloading rsign2..."
wget https://registry-cdn.wapm.io/contents/jedisct1/rsign2/0.6.1/rsign.wasm /usr/local/bin/rsign2
echo "downloading ruby..."
wget https://registry-cdn.wapm.io/contents/katei/ruby/0.1.2/dist/ruby.wasm /usr/local/bin/ruby
echo "downloading clang..."
wget https://registry-cdn.wapm.io/contents/_/clang/0.1.0/clang.wasm /usr/local/bin/clang
echo "downloading wasm-ld..."
wget https://registry-cdn.wapm.io/contents/_/clang/0.1.0/wasm-ld.wasm /usr/local/bin/wasm-ld
