case class ScriptRNG(vs: Vector[Int], i: Int = 0) extends RNG:
  def nextInt: (Int, RNG) = (vs(i % vs.size), ScriptRNG(vs, i + 1))

def scriptRng(vs: Int*): ScriptRNG = ScriptRNG(vs.toVector)

def seeds: scala.List[SimpleRNG] = (1L to 300L).toList.map(s => SimpleRNG(s * 1000003L * 1000003L))

@main def tests(): Unit =
  Judge.check("n=0 이면 항상 0")(seeds.forall(r => nonNegativeMax(0)(r)._1 == 0), true)
  Judge.check("n=3: 항상 0..3")(seeds.forall(r => { val x = nonNegativeMax(3)(r)._1; x >= 0 && x <= 3 }), true)
  Judge.check("n=3: 0,1,2,3 이 모두 나온다")(seeds.map(r => nonNegativeMax(3)(r)._1).toSet, scala.collection.immutable.Set(0, 1, 2, 3))
  Judge.check("n=100: 항상 범위 안")(seeds.forall(r => { val x = nonNegativeMax(100)(r)._1; x >= 0 && x <= 100 }), true)
  Judge.check("극단값에서도 n 이하")(scala.List(Int.MaxValue, Int.MinValue, 0, -1).forall(v => { val x = nonNegativeMax(10)(scriptRng(v))._1; x >= 0 && x <= 10 }), true)
  Judge.check("RNG 는 정확히 한 번 전진")(nonNegativeMax(10)(SimpleRNG(5))._2, SimpleRNG(5).nextInt._2)
