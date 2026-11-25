case class Vec2(x: Int, y: Int):
  def +(o: Vec2): Vec2 = Vec2(x + o.x, y + o.y)
  def -(o: Vec2): Vec2 = Vec2(x - o.x, y - o.y)
  def unary_- : Vec2 = Vec2(-x, -y)

class Scores(n: Int):
  private val a = Array.fill(n)(0)
  def apply(i: Int): Int = a(i)
  def update(i: Int, v: Int): Unit = a(i) = v
