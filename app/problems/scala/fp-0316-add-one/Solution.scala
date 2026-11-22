def addOne(l: List[Int]): List[Int] = l match
  case Nil => Nil
  case Cons(h, t) => Cons(h + 1, addOne(t))
