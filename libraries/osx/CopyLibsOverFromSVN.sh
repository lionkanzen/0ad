#!/bin/sh
# To avoid a time-consuming process and to maximize space efficiency,
# this script copies over from your SVN folder the library files requires
# to compile the game.
# I recommend also copying over your xcode project then running update-workspaces.sh

svnLibFolder="/Users/Lancelot/Desktop/0ad-svn/trunk/libraries/osx/."
gitLibFolder="/Users/Lancelot/Desktop/0ad-git/libraries/osx/"

cd $svnLibFolder

find . -maxdepth 1 -iregex "./[a-zA-Z0-9]*" -exec mkdir -p $gitLibFolder{} \;
find . -maxdepth 2 -ipath "./*/lib" -exec cp -Rv {} $gitLibFolder{} \;
find . -maxdepth 2 -ipath "./*/share" -exec cp -Rv {} $gitLibFolder{} \;
find . -maxdepth 2 -ipath "./*/include" -exec cp -Rv {} $gitLibFolder{} \;
find . -maxdepth 2 -ipath "./*/bin" -exec cp -Rv {} $gitLibFolder{} \;

cp -Rv "../source/cxxtest-4.4/bin" $gitLibFolder"../source/cxxtest-4.4/"
cp -Rv "../source/cxxtest-4.4/cxxtest" $gitLibFolder"../source/cxxtest-4.4/" 
cp -Rv "../source/fcollada/lib" $gitLibFolder"../source/fcollada/"
cp -Rv "../source/nvtt/lib" $gitLibFolder"../source/nvtt/" 
cp -Rv "../source/spidermonkey/include-unix-debug" $gitLibFolder"../source/spidermonkey/" 
cp -Rv "../source/spidermonkey/include-unix-release" $gitLibFolder"../source/spidermonkey/" 
cp -Rv "../source/spidermonkey/lib" $gitLibFolder"../source/spidermonkey/" 
