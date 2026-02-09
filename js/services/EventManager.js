import { exportJson, exportImage, loadJSONGraph, prepareAdvancedImport, applyAdvancedImport, cancelAdvancedImport } from './io.js';
import eventBus from './EventBus.js';
import { graphConfig } from '../config/index.js';
import { updateGraphConfig } from '../config/graph.js';
import { buildAppConfig, applyAppConfig } from './AppConfigService.js';

export class EventManager {
  static init(state, renderer) {
    // ----- 1) Link curvature -----
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

    // ----- 1bis) Force parameters -----
    document.getElementById('link-force')?.addEventListener('change', function() {
      graphConfig.forces.linkStrength = this.checked ? 1 : 0;
      renderer.updateForces();
    });
    document.getElementById('link-distance')?.addEventListener('change', function() {
      graphConfig.forces.linkDistance = parseFloat(this.value);
      renderer.updateForces();
    });
    document.getElementById('charge-strength')?.addEventListener('change', function() {
      graphConfig.forces.chargeStrength = parseFloat(this.value);
      renderer.updateForces();
    });
    document.getElementById('center-force')?.addEventListener('change', function() {
      graphConfig.forces.centerStrength = this.checked ? 1 : 0;
      renderer.updateForces();
    });
    document.getElementById('forceRecreateLinks')?.addEventListener('change', function() {
      graphConfig.forceRecreateLinks = this.checked;
      renderer.updateGraph();
    });

    // ----- 2) Graph import/export (JSON) -----
    document.getElementById('export-json')?.addEventListener('click', () => {
      exportJson();
    });
    document.getElementById('export-json-advanced')?.addEventListener('click', () => {
      alert("Export avancé : à faire plus tard.");
    });

    document.getElementById('export-image')?.addEventListener('click', () => {
      exportImage();
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

    // Advanced import (mapping)
    document.getElementById('import-json-advanced')?.addEventListener('click', () => {
      document.getElementById('json-file-advanced')?.click();
    });
    document.getElementById('json-file-advanced')?.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => prepareAdvancedImport(e.target.result);
      reader.readAsText(file);
    });
    document.getElementById('advanced-import-apply')?.addEventListener('click', () => {
      applyAdvancedImport();
    });
    document.getElementById('advanced-import-cancel')?.addEventListener('click', () => {
      cancelAdvancedImport();
    });

    // ----- 3) Graph configuration import/export -----
    // Export config
    const exportCfgBtn = document.getElementById('export-config');
    exportCfgBtn?.addEventListener('click', () => {
      const cfg = {
        linkStrength:  graphConfig.forces.linkStrength,
        linkDistance:  graphConfig.forces.linkDistance,
        chargeStrength:graphConfig.forces.chargeStrength,
        centerStrength:graphConfig.forces.centerStrength,
        curvedLinks:   graphConfig.linkStyle.curvedLinks,
        baseCurvature: graphConfig.linkStyle.baseCurvature,
        loopCurvature: graphConfig.linkStyle.loopCurvature,
        curvatureStep: graphConfig.linkStyle.curvatureStep,
        styleRules: graphConfig.styleRules,
        pieRules: graphConfig.pieRules
      };
      const blob = new Blob([JSON.stringify(cfg, null,2)], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'config.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    // Import config
    const importCfgInput = document.getElementById('import-config');
    importCfgInput?.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          updateGraphConfig(data, renderer);
        } catch(err) {
          console.error('Erreur parsing config:', err);
        }
      };
      reader.readAsText(file);
    });

    // ----- 4) App configuration import/export -----
    const exportAppBtn = document.getElementById('app-config-export');
    exportAppBtn?.addEventListener('click', () => {
      const includeAi = document.getElementById('app-config-include-ai')?.checked ?? true;
      const includeStyle = document.getElementById('app-config-include-style')?.checked ?? true;
      const includePie = document.getElementById('app-config-include-pie')?.checked ?? true;
      const cfg = buildAppConfig({ includeAi, includeStyle, includePie });
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'config-logiciel.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    const importAppInput = document.getElementById('app-config-import');
    importAppInput?.addEventListener('change', function() {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          applyAppConfig(data);
          renderer.updateGraph();
        } catch (err) {
          console.error('Erreur parsing config logiciel:', err);
        }
      };
      reader.readAsText(file);
    });
  }
}
