# 📊 Graph Creator (v0.1)

🇫🇷 [Version française](README_fr.md)

**Graph Creator** is an interactive tool for creating and editing directed graphs that allows you to easily visualize and manipulate networks of nodes and links. Based on D3.js, this tool offers an intuitive interface to build complex graphs, configure them visually, and export them.

![screenshot - v0.1.jpeg](screenshot - v0.1.jpeg "screenshot - v0.1.jpeg")

## 🚀 Introduction

Graph Creator v0.1 is a web application that lets you create, visualize, and manipulate graphs directly in your browser. With intuitive editing features and a modern user interface, the tool is suitable for designing simple diagrams as well as representing complex networks.

## ✨ Main Features (v0.1)

### 🔵 Node and Link Management

- ➕ Create nodes by double-clicking on the canvas
- 🔗 Create links between nodes (with Ctrl+click)
- 🔄 Support for self-links (loops)
- 🗑️ Delete nodes and links (Delete key)
- 🖱️ Move nodes with drag and drop

### 🎨 Appearance Customization

- 📐 Configure visual properties (node size, link width)
- ↔️ Choose between straight and curved links
- 📈 Adjust link curvature and loop size
- 📍 Multiple layout options (circle, grid, random)

### 📝 Data Editing

- 🏷️ Add custom fields for nodes and links
- ✏️ Direct property editing in forms
- 🔤 Choose fields to use for labels and sizes

### 🛠️ Other Tools

- ⏪ Complete history with undo/redo
- 🔍 Zoom and pan functionality
- 💾 Import/Export in JSON format
- 🧠 Graph generation via AI model (Ollama)

## 🖥️ User Interface

The interface is organized into four main tabs:

### ❓ Help (?)

- 📖 Keyboard shortcuts and main actions guide

### ⚙️ Actions

- ↩️ Undo/Redo buttons
- 📜 Action history

### 📊 Values

- 📤 Graph import/export
- ⚙️ Display field settings
- 📋 Node and link editing forms
- 🏷️ Custom field management

### 🔧 Config Graph

- 🧭 Layout selection and refresh (Circle, Grid, Random)
- 🔗 Link style configuration
- 🧲 Force simulation parameters

### 🤖 AI Request

- ✨ Graph generation from text descriptions
- 💡 Suggestions for additions to the current graph
- 🧠 Integration with local models via Ollama

## 🚀 Quick Usage

- ➕ **Create a node**: Double-click on an empty area
- 🔗 **Create a link**: Select a node, then Ctrl+Click on another node
- 🔄 **Create a link with new node**: Select a node, then Ctrl+Click on an empty area
- 🗑️ **Delete**: Select an element and press Delete or Backspace
- 📍 **Apply a layout**: Select a layout type and click "Reload"

## ⚡ Installation and Setup

1. 📥 Clone the repository
2. 🌐 Launch a local web server (for example with `python -m http.server`)
3. 🌎 Open the application in your browser

For AI features, ensure that [Ollama](https://github.com/ollama/ollama) is installed and running locally.

## 💻 Technologies Used

- 📊 **D3.js v6**: Data visualization and physics simulation
- 🔧 **JavaScript (ES6+)**: Application logic
- 🎨 **Bootstrap 4**: Responsive user interface
- 🧠 **Ollama API**: Integration with language models for graph generation

## 🔮 Future Development

This project is in active development. Features planned for upcoming versions include:

- 🎭 Custom node styles (colors, shapes)
- 🖼️ Export to different formats (SVG, PNG)
- 🔍 Filters and search in large graphs
- 📈 Graph analytics and metrics
- ...and thousands of other features.
