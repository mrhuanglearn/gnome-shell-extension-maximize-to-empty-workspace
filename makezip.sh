#!/bin/sh

NAME=MaximizeToEmptyWorkspace@mrhuang.github.com
cd $NAME
zip -r $NAME.zip *
mv $NAME.zip ../..
cd ..

