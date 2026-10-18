import { describe, expect, it } from "vitest";
import { cleanColor, cleanMessage, cleanName, MESSAGE_MAX, NAME_MAX } from "../sanitize";

describe("sanitize", () => {
  it("quita etiquetas y caracteres peligrosos de los apodos", () => {
    expect(cleanName("<b onclick=x>Ana</b>")).toBe("b onclick=xAnab");
    expect(cleanName("  Luna \u202e\u200b  ")).toBe("Luna");
    expect(cleanName("a".repeat(100))).toHaveLength(NAME_MAX);
    expect(cleanName("José 💛")).toBe("José 💛");
  });

  it("el chat conserva el texto pero sin controles ni saltos", () => {
    expect(cleanMessage("hola\n\nmundo\u0007")).toBe("hola mundo");
    expect(cleanMessage("te quiero <3")).toBe("te quiero <3"); // React lo escapa al mostrar
    expect(cleanMessage("x".repeat(1000))).toHaveLength(MESSAGE_MAX);
    expect(cleanMessage("   ")).toBe("");
  });

  it("valida colores", () => {
    expect(cleanColor("#AABBCC")).toBe("#aabbcc");
    expect(cleanColor("red; background:url(x)")).toBe("#c2512e");
  });
});
