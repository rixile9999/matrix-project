class Point(val x: Int, val y: Int):
  override def equals(other: Any): Boolean = other match
    case p: Point => x == p.x && y == p.y
    case _ => false
  override def hashCode: Int = (x, y).hashCode
