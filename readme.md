# OmeletteSync

OmeletteSync is a cloud storage sync tool with privacy concerns in mind.

## Primary goals:
- Synchronize files with cloud storage providers
- Automatically detect file changes on your computer
- Encrypt files before upload
- Distribute files among multiple accounts
- Run on OSX, Linux support is planned

Supported cloud storage providers:
- Google Drive

## Development notice

This application is in an early development stage and not yet ready for any use.

- [x] Implement a changes listener for OSX
- [x] Implement a changes listener for GNU/Linux
- [x] Upload, Remove, Move files on Google Drive
- [ ] Upload controller to distribute files among multiple providers/ accounts
- [x] Encryption mechanism
- [ ] Frontend to configure accounts and see sync status
- [ ] Menubar application for OSX

## Tasks
- [ ] add binary version of fswatch for mac osx
- [ ] test shellwatcher under linux
- [ ] add cli
 - [ ] store google drive auth in database
 - [ ] add dialog to set mountdir, watchhome and other prefs in cli
 - [ ] add options to pull or push only
- [ ] proper error and logging events
- [ ] add task to transform es6 code
- [ ] googledriveapi: detect changes limited to mountdir
- [ ] move files to trash rather than erase completely


## License
This project is released under the GNU General Public License v3.
```
OmeletteSync, Copyright (C) 2016 by Andrin Bertschi

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 3 of the License.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
```
