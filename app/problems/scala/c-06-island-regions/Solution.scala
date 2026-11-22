type Pos = (Int, Int)

private def isLand(grid: List[String], p: Pos): Boolean =
  val (r, c) = p
  grid.indices.contains(r) && grid(r).indices.contains(c) && grid(r)(c) == '#'

def neighbours(grid: List[String], p: Pos): List[Pos] =
  val (r, c) = p
  List((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)).filter(isLand(grid, _))

def region(grid: List[String], start: Pos): Set[Pos] =
  def go(p: Pos, seen: Set[Pos]): Set[Pos] =
    if seen(p) then seen
    else neighbours(grid, p).foldLeft(seen + p)((acc, n) => go(n, acc))
  if isLand(grid, start) then go(start, Set.empty) else Set.empty

private def landCells(grid: List[String]): List[Pos] =
  for
    r <- grid.indices.toList
    c <- grid(r).indices
    if grid(r)(c) == '#'
  yield (r, c)

private def regions(grid: List[String]): List[Set[Pos]] =
  val (_, found) = landCells(grid).foldLeft((Set.empty[Pos], List.empty[Set[Pos]])) {
    case ((seen, acc), p) =>
      if seen(p) then (seen, acc)
      else
        val reg = region(grid, p)
        (seen ++ reg, reg :: acc)
  }
  found.reverse

def countRegions(grid: List[String]): Int =
  regions(grid).size

def largestRegion(grid: List[String]): Int =
  regions(grid).map(_.size).maxOption.getOrElse(0)
