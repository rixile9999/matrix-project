class Grid(val w: Int, val h: Int):
  private val cells = Array.fill(w * h)(0)
  def apply(r: Int, c: Int): Int = cells(r * w + c)
  def update(r: Int, c: Int, v: Int): Unit = cells(r * w + c) = v
