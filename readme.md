_Ahoy! This project is in early development and not yet ready for any use_ :soon::clock1::arrows_counterclockwise:

# OmeletteSync


![OmeletteSync](http://vignette4.wikia.nocookie.net/guilds/images/2/27/Omelette.gif)

OmeletteSync is a file synchronization tool for cloud storage.  
It keeps track of all your files, synchronizes changes with the cloud
and uses industrial encryption standards to encrypt your files during synchronization.

## Core features

- Automatically detect file changes
- Synchronize files with cloud storage providers
- Transparent encryption layer
- Combine multiple accounts into a single logical unit for the purpose of storage expansion
- Support for Mac OS X and Linux

## Supported storage providers
As for the beginning, Google Drive is supported.

## Development notice

This application is in an early development stage and not yet ready for any use.

- [x] Implement a changes listener for OSX
- [x] Implement a changes listener for GNU/Linux
- [x] Upload, Remove, Move files on Google Drive
- [ ] Upload controller to distribute files among multiple providers/ accounts
- [x] Encryption mechanism
- [ ] add binary version of fswatch for mac osx
- [ ] test shellwatcher under linux
- [x] add cli
 - [x] store google drive auth in database
 - [x] add dialog to set mountdir, watchhome and other prefs in cli
 - [ ] add options to pull or push only
- [x] proper error and logging events
- [ ] add task to transform es6 code
- [ ] googledriveapi: detect changes limited to mountdir
- [ ] move files to trash rather than erase completely
- [ ] Frontend to configure accounts and see sync status
- [ ] Menubar application

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
