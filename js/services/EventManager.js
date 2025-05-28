import { exportJson, loadJSONGraph } from './io.js';
import { graphConfig } from '../config/index.js';
import { updateGraphConfig } from '../config/graph.js';

export class EventManager {
  static init(state, renderer) {
    // ----- 1) Courbure des liens -----
    const curvedChk = document.getElementById('curved-links');
    curvedChk?.addEventListener('change', function() {
      graphConfig.linkStyle.curvedLinks = this.checked;
      document.getElementById('curvature-controls').style.display = this.checked ? 'block' : 'none';
      renderer.updateGraph();
    });
    // Base curvature
    document.getElementById('base-curvature')?.addEventListener('input', function() {
      graphConfig.linkStyle.baseCurvature = parseFloat(this.value);
      document.getElementById('base-curvature-value').textContent = this.value;
      renderer.updateGraph();
    });
    // Loop curvature
    document.getElementById('loop-curvature')?.addEventListener('input', function() {
      graphConfig.linkStyle.loopCurvature = parseFloat(this.value);
      document.getElementById('loop-curvature-value').textContent = this.value;
      renderer.updateGraph();
    });
    // Parallel offset
    document.getElementById('curvature-step')?.addEventListener('input', function() {
      graphConfig.linkStyle.curvatureStep = parseFloat(this.value);
      document.getElementById('curvature-step-value').textContent = this.value;
      renderer.updateGraph();
    });

    // ----- 2) Import/Export du graphe (JSON) -----
    document.getElementById('export-json')?.addEventListener('click', () => {
      exportJson();
    });
    document.getElementById('import-json')?.addEventListener('click', () => {
      document.getElementById('json-file')?.click();
    });
    document.getElementById('json-file')?.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => loadJSONGraph(e.target.result);
      reader.readAsText(file);
    });

    // ----- 3) Import/Export de la configuration du graphe -----
    // Export config
    document.getElementById('export-config')?.addEventListener('click', () => {
      // reuse existing logic from setupConfigButtons
      const cfg = {
        linkStrength: graphConfig.forces.linkStrength,
        linkDistance: graphConfig.forces.linkDistance,
        chargeStrength: graphConfig.forces.chargeStrength,
        centerStrength: graphConfig.forces.centerStrength,
        curvedLinks: graphConfig.linkStyle.curvedLinks,
        baseCurvature: graphConfig.linkStyle.baseCurvature,
        loopCurvature: graphConfig.linkStyle.loopCurvature,
        curvatureStep: graphConfig.linkStyle.curvatureStep
      };
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'config.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    // Import config
    document.getElementById('import-config')?.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          updateGraphConfig(data, renderer);
        } catch (err) {
          console.error('Erreur parsing config:', err);
        }
      };
      reader.readAsText(file);
    });

    // ----- 4) Sélection d’un fichier de config JSON (liste déroulante) -----
    document.getElementById('json-files')?.addEventListener('change', async function() {
      const sel = this.value;
      if (!sel) return;
      try {
        const resp = await fetch(graphConfig.paths.configDirectory + sel);
        const json = await resp.json();
        updateGraphConfig(json, renderer);
      } catch (err) {
        console.error('Chargement config err:', err);
      }
    });

    // ----- 5) Wrapping unique de updateGraph (facultatif) -----
    const orig = renderer.updateGraph.bind(renderer);
    renderer.updateGraph = () => {
      // pré-update hooks si besoin…
      orig();
      // post-update hooks si besoin…
    };
  }
}
