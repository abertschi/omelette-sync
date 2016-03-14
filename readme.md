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
- [ ] Implement a changes listener for GNU/Linux
- [ ] Upload, Remove, Move files on Google Drive
- [ ] Upload controller to distribute files among multiple providers/ accounts
- [ ] Encryption mechanism
- [ ] Frontend to configure accounts and see sync status
- [ ] Menubar application for OSX

## Design notes
- communication between client and daemon with websockets
- electron client
- mac osx menubar app

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
