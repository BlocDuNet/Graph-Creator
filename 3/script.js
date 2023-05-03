      d3.json("json.json").then(function(data) {

        const width = 300;
        const height = 200;

        const simulation = d3.forceSimulation(data.nodes)
          .force("link", d3.forceLink(data.links).id(d => d.id))
          .force("charge", d3.forceManyBody())
          .force("center", d3.forceCenter(width / 2, height / 2));

        const svg = d3.select("#graph")
          .attr("viewBox", [0, 0, width, height]);

        const defs = svg.append("defs");

        defs.append("marker")
          .attr("id", "arrowhead")
          .attr("viewBox", "-0 -5 10 10")
          .attr("refX", 25)
          .attr("refY", 0)
          .attr("orient", "auto")
          .attr("markerWidth", 10)
          .attr("markerHeight", 10)
          .attr("xoverflow", "visible")
          .append("svg:path")
          .attr("d", "M 0,-5 L 10 ,0 L 0,5")
          .attr("fill", "#999")
          .attr("stroke", "#999");

        const link = svg.selectAll(".link")
          .data(data.links)
          .join("line")
          .classed("link", true)
          .attr("stroke-width", 2);

        const node = svg.selectAll(".node")
          .data(data.nodes)
          .join("circle")
          .classed("node", true)
          .attr("r", 10)
          .attr("fill", "#333")
          .attr("stroke", "#fff")
          .attr("stroke-width", 1.5)
          .call(drag(simulation));

        node.append("title")
          .text(d => d.id);

        const label = svg.selectAll(".label")
          .data(data.nodes)
          .join("foreignObject")
          .classed("label", true)
          .attr("width", 100)
          .attr("height", 50)
          .attr("x", d => d.x + 20)
          .attr("y", d => d.y)
          .html(d => `<div contentEditable="true" style="font-size: 12px;">${d.id}</div>`);
      
        label.on("input", function(event, d) {
          const newText = event.target.textContent;
          d.id = newText;
        });
      
        simulation.on("tick", () => {
            
        link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

        node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);
        label
            .attr("x", d => d.x + 20)
            .attr("y", d => d.y);
        });

        function drag(simulation) {

          function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          }

          function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
          }

          function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }

          return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
        }

        
      });