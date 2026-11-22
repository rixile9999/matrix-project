def collapse(xs: List[Int]): List[Int] = xs match
  case a :: (rest @ (b :: _)) if a == b => collapse(rest)
  case a :: rest                        => a :: collapse(rest)
  case Nil                              => Nil
