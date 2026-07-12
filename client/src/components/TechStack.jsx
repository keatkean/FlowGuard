import React from 'react';

const TechStack = () => {
  const technologies = [
    "React", "Vite", "Node.js", "Express", "PostgreSQL", "Sequelize",
    "Python", "FastAPI", "InsightFace", "Ultralytics YOLO", "OpenCV",
    "ONNX Runtime / NumPy", "Raspberry Pi Camera integration",
    "WhatsApp Cloud API mock-safe demo"
  ];
  const displayStack = [...technologies, ...technologies];

  return (
    <section className="tech-stack-section">
      <div className="tech-stack-title">FlowGuard Technology Stack</div>
      <p className="tech-stack-note">
        Built with project technologies. InsightFace generates 512-dimensional facial embeddings.
        PostgreSQL stores the enrolled template using the current FLOAT[] model field, while the
        Python AI service performs similarity matching.
      </p>
      <div className="marquee-container">
        <div className="marquee-content">
          {displayStack.map((tech, i) => (
            <div key={`${tech}-${i}`} className="tech-item">
              <span className="tech-dot"></span>
              {tech}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TechStack;
