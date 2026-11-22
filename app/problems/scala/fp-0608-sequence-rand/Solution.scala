def sequence[A](fs: List[Rand[A]]): Rand[List[A]] =
  fs.foldRight(unit(List.empty[A]))((f, acc) => map2(f, acc)(_ :: _))

def randInts(count: Int): Rand[List[Int]] =
  sequence(List.fill(count)(int))
