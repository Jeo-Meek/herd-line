import Phaser from "phaser";

function addCanvas(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): void {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  paint(ctx);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

export function generateTextures(scene: Phaser.Scene): void {
  addCanvas(scene, "sheep", 32, 32, (ctx) => {
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillStyle = "rgba(40,40,40,0.22)";
    ctx.beginPath();
    ctx.ellipse(16, 26, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4efe4";
    ctx.beginPath();
    ctx.ellipse(16, 18, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e7d3b5";
    ctx.beginPath();
    ctx.ellipse(7, 10, 5, 4, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(25, 10, 5, 4, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff8ee";
    ctx.beginPath();
    ctx.arc(16, 11, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a221c";
    ctx.beginPath();
    ctx.arc(13.5, 10.5, 1.4, 0, Math.PI * 2);
    ctx.arc(18.5, 10.5, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c9a07a";
    ctx.beginPath();
    ctx.ellipse(16, 13.5, 2.2, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  addCanvas(scene, "wolf", 48, 48, (ctx) => {
    ctx.clearRect(0, 0, 48, 48);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(24, 40, 14, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5b6573";
    ctx.beginPath();
    ctx.moveTo(8, 28);
    ctx.quadraticCurveTo(24, 6, 40, 28);
    ctx.quadraticCurveTo(24, 40, 8, 28);
    ctx.fill();
    ctx.fillStyle = "#3d4550";
    ctx.beginPath();
    ctx.moveTo(14, 16);
    ctx.lineTo(18, 4);
    ctx.lineTo(22, 16);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(26, 16);
    ctx.lineTo(30, 4);
    ctx.lineTo(34, 16);
    ctx.fill();
    ctx.fillStyle = "#d7dde5";
    ctx.beginPath();
    ctx.ellipse(24, 26, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1210";
    ctx.beginPath();
    ctx.arc(20, 22, 2, 0, Math.PI * 2);
    ctx.arc(28, 22, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#c45c4a";
    ctx.beginPath();
    ctx.arc(24, 28, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  addCanvas(scene, "grass", 128, 128, (ctx) => {
    ctx.fillStyle = "#8fc86a";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#7fba5b";
    for (let i = 0; i < 80; i++) {
      const x = (i * 47) % 128;
      const y = (i * 89) % 128;
      ctx.fillRect(x, y, 2, 5);
    }
    ctx.fillStyle = "#d9e98a";
    for (let i = 0; i < 18; i++) {
      const x = (i * 73 + 10) % 128;
      const y = (i * 51 + 20) % 128;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  addCanvas(scene, "rock", 64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(32, 48, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8b8174";
    ctx.beginPath();
    ctx.ellipse(32, 34, 24, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#a3988b";
    ctx.beginPath();
    ctx.ellipse(24, 28, 10, 7, -0.4, 0, Math.PI * 2);
    ctx.fill();
  });

  addCanvas(scene, "dot", 8, 8, (ctx) => {
    ctx.fillStyle = "#c68642";
    ctx.beginPath();
    ctx.arc(4, 4, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  addCanvas(scene, "hand", 64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "#2b2b2b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(22, 50);
    ctx.lineTo(22, 28);
    ctx.quadraticCurveTo(22, 18, 30, 18);
    ctx.lineTo(34, 18);
    ctx.quadraticCurveTo(40, 18, 40, 26);
    ctx.lineTo(40, 36);
    ctx.lineTo(46, 38);
    ctx.quadraticCurveTo(52, 40, 50, 46);
    ctx.lineTo(28, 54);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  addCanvas(scene, "bang", 32, 32, (ctx) => {
    ctx.fillStyle = "#e23d3d";
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 16, 17);
  });

  addCanvas(scene, "flower", 16, 16, (ctx) => {
    ctx.fillStyle = "#f2d66b";
    ctx.beginPath();
    ctx.arc(8, 8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f7a1c4";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(8 + Math.cos(a) * 4.5, 8 + Math.sin(a) * 4.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
