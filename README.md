# DJAMMS Player

A modern, cross-platform video player and management system built with React and Electron.

## Features

- **Multi-Platform**: Electron desktop app + web browser access
- **Real-time Sync**: Live queue management across all clients
- **Advanced UI**: Kiosk interface for public use, admin console for management
- **Video Playback**: Hardware-accelerated video with crossfading
- **Search & Browse**: Full music library management

## Quick Start

See [docs/QUICK_START.md](docs/QUICK_START.md) for detailed setup instructions.

## Architecture

- **Electron App**: Local desktop player with admin console
- **Web Kiosk**: Public touchscreen interface
- **Web Admin**: Remote administration console
- **Real-time Sync**: Supabase-powered state synchronization

## Documentation

- [Database Schema](db/)
- [API Documentation](docs/)
- [Deployment Guide](docs/DEPLOYMENT.md)
