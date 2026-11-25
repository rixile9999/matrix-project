class Poly(val coeffs: List[Int]):
  def apply(x: Int): Int = coeffs.foldRight(0)((c, acc) => c + x * acc)
