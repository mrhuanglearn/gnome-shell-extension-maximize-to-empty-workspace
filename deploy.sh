#!/bin/sh

NAME=MaximizeToEmptyWorkspace@mrhuang.github.com
rm -rf ~/.local/share/gnome-shell/extensions/$NAME
cp -r $NAME ~/.local/share/gnome-shell/extensions/.
