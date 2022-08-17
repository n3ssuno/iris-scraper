#!/bin/bash

curl -O https://unofficial-builds.nodejs.org/download/release/v12.3.1/node-v12.3.1-linux-armv6l.tar.xz

tar -xvf node-v12.3.1-linux-armv6l.tar.xz
rm node-v12.3.1-linux-armv6l.tar.xz

mkdir /opt/nodejs/
mv node-v12.3.1-linux-armv6l/* /opt/nodejs/
rmdir node-v12.3.1-linux-armv6l/

ln -s /opt/nodejs/bin/node /usr/bin/node
ln -s /opt/nodejs/bin/node /usr/sbin/node
ln -s /opt/nodejs/bin/node /sbin/node
ln -s /opt/nodejs/bin/node /usr/local/bin/node
ln -s /opt/nodejs/bin/npm /usr/bin/npm
ln -s /opt/nodejs/bin/npm /usr/sbin/npm
ln -s /opt/nodejs/bin/npm /sbin/npm
ln -s /opt/nodejs/bin/npm /usr/local/bin/npm
