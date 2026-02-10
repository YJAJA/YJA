
const noBtn = document.getElementById("no");
const yesBtn = document.getElementById("yes");

let scale = 1;

noBtn.addEventListener("mouseover", () => {
  const btnRect = noBtn.getBoundingClientRect();

  const maxX = window.innerWidth - btnRect.width;
  const maxY = window.innerHeight - btnRect.height;

  const randomX = Math.random() * maxX;
  const randomY = Math.random() * maxY;

  noBtn.style.position = "fixed";
  noBtn.style.left = randomX + "px";
  noBtn.style.top = randomY + "px";

  scale += 0.15;
  yesBtn.style.transform = `scale(${scale})`;
 
});

 yesBtn.addEventListener("click", () => {
  window.location.href = "yes.html";
});
